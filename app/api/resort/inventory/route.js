import { FieldValue } from "firebase-admin/firestore"
import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"
import { validateInventoryItem } from "@/lib/inventory-domain.mjs"
import {
  authenticateBookingAdmin,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

function canManageInventory(user) {
  return Boolean(user.ownerUid) && (user.isOwner || user.staffRole === "admin")
}

function itemCollection(db, ownerUid) {
  return db.collection("resortOwners").doc(ownerUid).collection("inventoryItems")
}

function auditActor(user) {
  return {
    ownerUid: user.ownerUid,
    actorUid: user.uid,
    actorEmail: user.email,
    actorRole: user.staffRole,
  }
}

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!canManageInventory(authResult.user)) {
    return jsonFailure("Inventory is available to resort owners and Admin staff.", 403)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const snapshot = await itemCollection(db, authResult.user.ownerUid)
      .orderBy("name", "asc")
      .limit(1000)
      .get()
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    return Response.json({ items })
  } catch (error) {
    console.error("Failed to load resort inventory:", error)
    return jsonFailure("Inventory could not be loaded.", 500)
  }
}

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!canManageInventory(authResult.user)) {
    return jsonFailure("Inventory is available to resort owners and Admin staff.", 403)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }

  const action = String(body?.action || "")
  if (!["create", "update", "archive", "restore"].includes(action)) {
    return jsonFailure("A valid inventory action is required.", 400)
  }
  const collection = itemCollection(db, authResult.user.ownerUid)
  const itemId = String(body?.itemId || "").trim()
  if (action !== "create" && (!itemId || itemId.includes("/") || itemId.length > 150)) {
    return jsonFailure("A valid inventory item is required.", 400)
  }
  const itemRef = action === "create" ? collection.doc() : collection.doc(itemId)
  const actor = auditActor(authResult.user)

  try {
    if (action === "create" || action === "update") {
      const item = body.item
      if (!validateInventoryItem(item)) {
        return jsonFailure("Enter an item name, category, quantity, and valid low-stock threshold.", 400)
      }
      const next = {
        name: item.name.trim(),
        category: item.category.trim(),
        quantity: item.quantity,
        lowStockThreshold: item.lowStockThreshold,
        updatedAt: new Date(),
      }
      await db.runTransaction(async (transaction) => {
        let before = {}
        if (action === "create") {
          transaction.create(itemRef, { ...next, isArchived: false, createdAt: new Date() })
        } else {
          const current = await transaction.get(itemRef)
          if (!current.exists) {
            const error = new Error("Inventory item not found.")
            error.status = 404
            throw error
          }
          before = current.data()
          if (before.isArchived === true) {
            const error = new Error("Restore this item before editing it.")
            error.status = 409
            throw error
          }
          transaction.update(itemRef, next)
        }
        writeResortAdminAudit(transaction, db, {
          ...actor,
          action: `inventory.${action}`,
          entityType: "inventory-item",
          entityId: itemRef.id,
          summary: action === "create" ? "An inventory item was added." : "An inventory item was updated.",
          before: {
            itemName: before.name,
            category: before.category,
            quantity: before.quantity,
            lowStockThreshold: before.lowStockThreshold,
          },
          after: {
            itemName: next.name,
            category: next.category,
            quantity: next.quantity,
            lowStockThreshold: next.lowStockThreshold,
          },
        })
      })
      return Response.json({ success: true, itemId: itemRef.id })
    }

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(itemRef)
      if (!current.exists) {
        const error = new Error("Inventory item not found.")
        error.status = 404
        throw error
      }
      const before = current.data()
      const archived = action === "archive"
      if ((before.isArchived === true) === archived) {
        const error = new Error(archived ? "This item is already archived." : "This item is already active.")
        error.status = 409
        throw error
      }
      transaction.update(itemRef, {
        isArchived: archived,
        ...(archived ? { archivedAt: new Date() } : { archivedAt: FieldValue.delete() }),
        updatedAt: new Date(),
      })
      writeResortAdminAudit(transaction, db, {
        ...actor,
        action: `inventory.${action}`,
        entityType: "inventory-item",
        entityId: itemRef.id,
        summary: archived ? "An inventory item was archived." : "An inventory item was restored.",
        before: {
          itemName: before.name,
          category: before.category,
          quantity: before.quantity,
          lowStockThreshold: before.lowStockThreshold,
          isArchived: before.isArchived === true,
        },
        after: {
          itemName: before.name,
          category: before.category,
          quantity: before.quantity,
          lowStockThreshold: before.lowStockThreshold,
          isArchived: archived,
        },
      })
    })
    return Response.json({ success: true, itemId: itemRef.id, isArchived: action === "archive" })
  } catch (error) {
    console.error(`Failed to ${action} resort inventory item:`, error)
    return jsonFailure(error.status ? error.message : "The inventory item could not be saved.", error.status || 500)
  }
}
