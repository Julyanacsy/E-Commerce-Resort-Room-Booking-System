import { FieldValue } from "firebase-admin/firestore"
import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"
import {
  getInspectionFindings,
  validateInspectionEntries,
  validateRoomItem,
} from "@/lib/room-inspection-domain.mjs"
import {
  authenticateBookingAdmin,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
} from "@/lib/booking-api-server"
import { roomBelongsToTenant } from "@/lib/booking-tenant"

const MAX_RECORDS = 1000

function isRoomInventoryManager(user) {
  return user.isOwner || user.staffRole === "admin"
}

function ownerCollection(db, ownerUid, name) {
  return db.collection("resortOwners").doc(ownerUid).collection(name)
}

function timestampToIso(value) {
  return value?.toDate?.().toISOString() || null
}

function actor(user) {
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
  if (!authResult.user.ownerUid || !hasBookingPermission(authResult.user, "stay")) {
    return jsonFailure("Your staff role cannot access room inspections.", 403)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const ownerUid = authResult.user.ownerUid
    const [roomsSnapshot, itemsSnapshot, bookingsSnapshot, inspectionsSnapshot] = await Promise.all([
      db.collection("rooms").where("ownerUid", "==", ownerUid).limit(MAX_RECORDS).get(),
      ownerCollection(db, ownerUid, "roomInventoryItems").limit(MAX_RECORDS).get(),
      db.collection("guestbooking").where("ownerUid", "==", ownerUid).limit(MAX_RECORDS).get(),
      ownerCollection(db, ownerUid, "roomInspections").limit(MAX_RECORDS).get(),
    ])
    const rooms = roomsSnapshot.docs
      .filter((room) => room.get("isArchived") !== true)
      .map((room) => ({ id: room.id, name: String(room.get("name") || "Room") }))
    const roomIds = new Set(rooms.map((room) => room.id))
    const roomItems = itemsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => roomIds.has(item.roomId))
    const inspections = Object.fromEntries(inspectionsSnapshot.docs.map((item) => {
      const data = item.data()
      return [item.id, {
        ...data,
        preCheckIn: data.preCheckIn ? {
          ...data.preCheckIn,
          inspectedAt: timestampToIso(data.preCheckIn.inspectedAt),
        } : null,
        postCheckOut: data.postCheckOut ? {
          ...data.postCheckOut,
          inspectedAt: timestampToIso(data.postCheckOut.inspectedAt),
          items: (data.postCheckOut.items || []).map((entry) => ({
            ...entry,
            resolvedAt: timestampToIso(entry.resolvedAt),
          })),
        } : null,
      }]
    }))
    const bookings = bookingsSnapshot.docs.map((booking) => {
      const data = booking.data()
      return {
        id: booking.id,
        name: String(data.name || "Guest"),
        roomId: String(data.roomId || ""),
        roomType: String(data.roomType || "Room"),
        checkIn: String(data.checkIn || ""),
        checkOut: String(data.checkOut || ""),
        status: String(data.status || ""),
        stayStatus: String(data.stayStatus || "not_checked_in"),
      }
    }).filter((booking) =>
      roomIds.has(booking.roomId)
      && (booking.status === "Approved" || (booking.status === "Completed" && booking.stayStatus === "checked_out"))
      && ["not_checked_in", "checked_in", "checked_out"].includes(booking.stayStatus),
    ).sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    return Response.json({ rooms, roomItems, bookings, inspections })
  } catch (error) {
    console.error("Failed to load room inventory monitoring:", error)
    return jsonFailure("Room inventory monitoring could not be loaded.", 500)
  }
}

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  const user = authResult.user
  if (!user.ownerUid || !hasBookingPermission(user, "stay")) {
    return jsonFailure("Your staff role cannot update room inspections.", 403)
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
  const managerAction = ["item.create", "item.update", "item.archive", "item.restore"].includes(action)
  if (managerAction && !isRoomInventoryManager(user)) {
    return jsonFailure("Only the resort owner or Admin staff can manage room item lists.", 403)
  }
  if (!managerAction && !["inspection.pre-check-in", "inspection.post-check-out", "inspection.resolve"].includes(action)) {
    return jsonFailure("A valid room inventory action is required.", 400)
  }

  const ownerUid = user.ownerUid
  const itemsCollection = ownerCollection(db, ownerUid, "roomInventoryItems")
  const inspectionsCollection = ownerCollection(db, ownerUid, "roomInspections")
  const eventActor = actor(user)

  try {
    if (action.startsWith("item.")) {
      const itemId = String(body.itemId || "").trim()
      if (action !== "item.create" && (!itemId || itemId.includes("/") || itemId.length > 150)) {
        return jsonFailure("A valid room item is required.", 400)
      }
      const itemRef = action === "item.create" ? itemsCollection.doc() : itemsCollection.doc(itemId)
      const roomId = String(body.roomId || body.item?.roomId || "").trim()
      const roomRef = db.collection("rooms").doc(roomId)
      const roomSnapshot = await roomRef.get()
      if (!roomSnapshot.exists || !roomBelongsToTenant(roomSnapshot.data(), ownerUid)) {
        return jsonFailure("Room not found for this resort.", 404)
      }
      if (roomSnapshot.get("isArchived") === true) return jsonFailure("Restore this room before managing its items.", 409)

      if (action === "item.archive" || action === "item.restore") {
        await db.runTransaction(async (transaction) => {
          const current = await transaction.get(itemRef)
          if (!current.exists || current.get("roomId") !== roomId) {
            const error = new Error("Room item not found.")
            error.status = 404
            throw error
          }
          const before = current.data()
          const archived = action === "item.archive"
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
            ...eventActor,
            action,
            entityType: "room-inventory-item",
            entityId: itemRef.id,
            summary: archived ? "A room inventory item was archived." : "A room inventory item was restored.",
            before: { itemName: before.name, category: before.category, isArchived: before.isArchived === true },
            after: { itemName: before.name, category: before.category, isArchived: archived },
          })
        })
        return Response.json({ success: true, itemId: itemRef.id })
      }

      if (!validateRoomItem(body.item)) {
        return jsonFailure("Provide a valid item name, category, type, and expected quantity.", 400)
      }
      const next = {
        roomId,
        roomName: String(roomSnapshot.get("name") || "Room"),
        name: body.item.name.trim(),
        category: body.item.category.trim(),
        itemType: body.item.itemType,
        expectedQuantity: body.item.expectedQuantity,
        updatedAt: new Date(),
      }
      await db.runTransaction(async (transaction) => {
        let before = {}
        if (action === "item.create") {
          transaction.create(itemRef, { ...next, ownerUid, isArchived: false, createdAt: new Date() })
        } else {
          const current = await transaction.get(itemRef)
          if (!current.exists || current.get("ownerUid") !== ownerUid) {
            const error = new Error("Room item not found.")
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
          ...eventActor,
          action,
          entityType: "room-inventory-item",
          entityId: itemRef.id,
          summary: action === "item.create" ? "A room inventory item was added." : "A room inventory item was updated.",
          before: { itemName: before.name, category: before.category, quantity: before.expectedQuantity },
          after: { itemName: next.name, category: next.category, quantity: next.expectedQuantity },
        })
      })
      return Response.json({ success: true, itemId: itemRef.id })
    }

    const bookingId = String(body.bookingId || "").trim()
    if (!bookingId || bookingId.includes("/") || bookingId.length > 150) {
      return jsonFailure("A valid booking is required.", 400)
    }
    const bookingRef = db.collection("guestbooking").doc(bookingId)
    const inspectionRef = inspectionsCollection.doc(bookingId)
    if (action === "inspection.resolve") {
      const itemId = String(body.itemId || "")
      const quantityRestocked = Number(body.quantityRestocked)
      if (!itemId || !Number.isInteger(quantityRestocked) || quantityRestocked < 0 || quantityRestocked > 1000) {
        return jsonFailure("A valid restock quantity is required.", 400)
      }
      await db.runTransaction(async (transaction) => {
        const [booking, inspection] = await Promise.all([
          transaction.get(bookingRef),
          transaction.get(inspectionRef),
        ])
        if (!booking.exists || booking.get("ownerUid") !== ownerUid) {
          const error = new Error("Booking not found for this resort.")
          error.status = 404
          throw error
        }
        if (booking.get("stayStatus") !== "checked_out" || !inspection.exists || !inspection.get("postCheckOut")) {
          const error = new Error("A post-checkout inspection is required before resolving item needs.")
          error.status = 409
          throw error
        }
        const postCheckOut = inspection.get("postCheckOut")
        const itemIndex = postCheckOut.items.findIndex((entry) => entry.itemId === itemId)
        if (itemIndex < 0 || !getInspectionFindings([postCheckOut.items[itemIndex]]).length) {
          const error = new Error("This item has no outstanding refill or replacement need.")
          error.status = 409
          throw error
        }
        const items = [...postCheckOut.items]
        items[itemIndex] = {
          ...items[itemIndex],
          resolvedAt: new Date(),
          resolvedBy: user.uid,
          quantityRestocked,
        }
        transaction.update(inspectionRef, { "postCheckOut.items": items, updatedAt: new Date() })
        writeResortAdminAudit(transaction, db, {
          ...eventActor,
          action: "inspection.resolve",
          entityType: "room-inspection",
          entityId: bookingId,
          summary: `Room item need resolved for ${items[itemIndex].name}.`,
          before: { itemName: items[itemIndex].name, quantity: items[itemIndex].quantity },
          after: { itemName: items[itemIndex].name, quantityRestocked, resolved: true },
        })
      })
      return Response.json({ success: true })
    }

    const phase = action === "inspection.pre-check-in" ? "preCheckIn" : "postCheckOut"
    await db.runTransaction(async (transaction) => {
      const booking = await transaction.get(bookingRef)
      if (!booking.exists || booking.get("ownerUid") !== ownerUid) {
        const error = new Error("Booking not found for this resort.")
        error.status = 404
        throw error
      }
      const currentStayStatus = String(booking.get("stayStatus") || "not_checked_in")
      const allowedBookingStatus = booking.get("status") === "Approved"
        || (phase === "postCheckOut" && booking.get("status") === "Completed")
      if (!allowedBookingStatus) {
        const error = new Error("Room inspections require an approved booking.")
        error.status = 409
        throw error
      }
      const stayStatus = currentStayStatus
      if (
        (phase === "preCheckIn" && stayStatus !== "not_checked_in")
        || (phase === "postCheckOut" && stayStatus !== "checked_out")
      ) {
        const error = new Error(phase === "preCheckIn"
          ? "Record the pre-check-in inspection before check-in."
          : "Record the post-checkout inspection after checkout.")
        error.status = 409
        throw error
      }
      const roomId = String(booking.get("roomId") || "")
      const itemQuery = itemsCollection.where("roomId", "==", roomId)
      const [roomItems, inspection] = await Promise.all([
        transaction.get(itemQuery),
        transaction.get(inspectionRef),
      ])
      const activeItems = roomItems.docs
        .filter((item) => item.get("isArchived") !== true)
        .map((item) => ({ id: item.id, ...item.data() }))
      if (!activeItems.length) {
        const error = new Error("Add active tracked items to this room before recording an inspection.")
        error.status = 409
        throw error
      }
      if (!validateInspectionEntries(body.items, activeItems)) {
        const error = new Error("Record a valid quantity and condition for every active item in this room.")
        error.status = 400
        throw error
      }
      const entries = body.items.map((entry) => {
        const template = activeItems.find((item) => item.id === entry.itemId)
        return {
          itemId: template.id,
          name: template.name,
          category: template.category,
          itemType: template.itemType,
          expectedQuantity: template.expectedQuantity,
          quantity: entry.quantity,
          condition: entry.condition,
          note: entry.note.trim(),
        }
      })
      const findings = phase === "postCheckOut" ? getInspectionFindings(entries) : []
      const now = new Date()
      const updatedPhase = {
        inspectedAt: now,
        inspectedBy: user.uid,
        items: entries,
        findings,
      }
      transaction.set(inspectionRef, {
        ownerUid,
        bookingId,
        roomId,
        roomName: String(booking.get("roomType") || "Room"),
        [phase]: updatedPhase,
        updatedAt: now,
      }, { merge: true })
      writeResortAdminAudit(transaction, db, {
        ...eventActor,
        action,
        entityType: "room-inspection",
        entityId: bookingId,
        summary: phase === "preCheckIn"
          ? "Pre-check-in room inventory inspection recorded."
          : "Post-checkout room inventory inspection recorded.",
        before: {},
        after: {
          roomType: String(booking.get("roomType") || "Room"),
          itemCount: entries.length,
          lowStockCount: findings.filter((finding) => finding.restockQuantity > 0).length,
          replacementCount: findings.filter((finding) => finding.needsReplacement).length,
        },
      })
    })
    return Response.json({ success: true, bookingId, phase })
  } catch (error) {
    console.error(`Failed to process room inventory action ${action}:`, error)
    return jsonFailure(error.status ? error.message : "Room inventory action could not be completed.", error.status || 500)
  }
}
