import { FieldValue } from "firebase-admin/firestore"
import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"
import { isValidRoomImages } from "@/lib/room-admin-validation.mjs"
import {
  authenticateBookingAdmin,
  getBookingDb,
  getLegacyRoomOwnerUid,
  jsonFailure,
} from "@/lib/booking-api-server"
import { roomBelongsToTenant } from "@/lib/booking-tenant"

const ROOM_FIELDS = [
  "name",
  "roomNumber",
  "type",
  "description",
  "price",
  "discount",
  "maxGuests",
  "bedType",
  "beds",
  "amenities",
  "availability",
  "featured",
  "images",
  "mapsUrl",
]

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function validString(value, maxLength) {
  return typeof value === "string" && value.length <= maxLength
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]))
}

function validRoom(room, existingImages = []) {
  if (!isPlainObject(room)) return false
  if (!validString(room.name, 120) || !room.name.trim()) return false
  if (!validString(room.roomNumber, 80) || !validString(room.type, 80)) return false
  if (!validString(room.description, 3000) || !validString(room.bedType, 80)) return false
  if (!validString(room.availability, 40) || !validString(room.mapsUrl || "", 2000)) return false
  if (![room.price, room.discount, room.maxGuests, room.beds].every(Number.isFinite)) return false
  if (!Array.isArray(room.amenities) || room.amenities.length > 30) return false
  if (!room.amenities.every((item) => validString(item, 100))) return false
  return isValidRoomImages(room.images, existingImages)
}

function canManageRoom(user, room, legacyUid) {
  if (user.isLegacyAdmin && !room.ownerUid) return true
  return roomBelongsToTenant(room, user.ownerUid || user.uid, legacyUid)
}

function auditActor(user, ownerUid) {
  return {
    ownerUid,
    actorUid: user.uid,
    actorEmail: user.email,
    actorRole: user.staffRole,
  }
}

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }

  const action = String(body?.action || "")
  if (!["room.create", "room.update", "room.archive", "room.restore"].includes(action) || !isPlainObject(body)) {
    return jsonFailure("A valid room action is required.", 400)
  }

  const user = authResult.user
  if (!user.isOwner && !user.isLegacyAdmin) {
    return jsonFailure("Only the resort owner can manage rooms.", 403)
  }
  const ownerUid = user.ownerUid || user.uid
  const roomId = String(body.roomId || "").trim()
  if (action !== "room.create" && (!roomId || roomId.includes("/") || roomId.length > 150)) {
    return jsonFailure("A valid room is required.", 400)
  }

  const roomRef = action === "room.create"
    ? db.collection("rooms").doc()
    : db.collection("rooms").doc(roomId)

  try {
    const legacyUid = await getLegacyRoomOwnerUid(db)
    const existing = action === "room.create" ? null : await roomRef.get()
    if (existing && !existing.exists) return jsonFailure("Room not found.", 404)
    const before = existing?.data() || {}
    if (existing && !canManageRoom(user, before, legacyUid)) {
      return jsonFailure("You cannot manage this room.", 403)
    }

    const eventActor = auditActor(user, ownerUid)
    if (action === "room.archive" || action === "room.restore") {
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(roomRef)
        if (!current.exists) {
          const error = new Error("Room not found.")
          error.status = 404
          throw error
        }
        const room = current.data()
        if (!canManageRoom(user, room, legacyUid)) {
          const error = new Error("You cannot manage this room.")
          error.status = 403
          throw error
        }
        const archived = action === "room.archive"
        transaction.update(roomRef, {
          isArchived: archived,
          ...(archived ? { archivedAt: new Date() } : { archivedAt: FieldValue.delete() }),
          updatedAt: new Date(),
        })
        writeResortAdminAudit(transaction, db, {
          ...eventActor,
          action,
          entityType: "room",
          entityId: roomRef.id,
          summary: archived ? "A resort room was archived." : "A resort room was restored.",
          before: { name: room.name, roomType: room.type, isArchived: room.isArchived === true },
          after: { name: room.name, roomType: room.type, isArchived: archived },
        })
      })
      return Response.json({ success: true, roomId: roomRef.id, isArchived: action === "room.archive" })
    }

    const room = pick(isPlainObject(body.room) ? body.room : {}, ROOM_FIELDS)
    if (!isPlainObject(body.room) || !validRoom(room, before.images)) {
      return jsonFailure("Room details are invalid.", 400)
    }
    const now = new Date()
    const after = {
      ...room,
      ownerUid,
      ...(action === "room.create" ? { createdAt: now } : { updatedAt: now }),
    }
    await db.runTransaction(async (transaction) => {
      let latestBefore = {}
      if (action === "room.create") {
        transaction.create(roomRef, after)
      } else {
        const current = await transaction.get(roomRef)
        if (!current.exists) {
          const error = new Error("Room not found.")
          error.status = 404
          throw error
        }
        latestBefore = current.data()
        if (!canManageRoom(user, latestBefore, legacyUid)) {
          const error = new Error("You cannot manage this room.")
          error.status = 403
          throw error
        }
        transaction.set(roomRef, after, { merge: true })
      }
      writeResortAdminAudit(transaction, db, {
        ...eventActor,
        action,
        entityType: "room",
        entityId: roomRef.id,
        summary: action === "room.create" ? "A resort room was created." : "A resort room was updated.",
        before: {
          name: latestBefore.name,
          roomType: latestBefore.type,
          price: latestBefore.price,
          availability: latestBefore.availability,
          imageCount: Array.isArray(latestBefore.images) ? latestBefore.images.length : 0,
        },
        after: {
          name: after.name,
          roomType: after.type,
          price: after.price,
          availability: after.availability,
          imageCount: after.images.length,
        },
      })
    })
    return Response.json({ success: true, roomId: roomRef.id })
  } catch (error) {
    console.error(`Failed to ${action} resort room:`, error)
    return jsonFailure(error.status ? error.message : "The room could not be saved.", error.status || 500)
  }
}
