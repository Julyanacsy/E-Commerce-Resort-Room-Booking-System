import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"
import { FieldValue } from "firebase-admin/firestore"
import {
  authenticateBookingAdmin,
  getBookingDb,
  getLegacyRoomOwnerUid,
  jsonFailure,
} from "@/lib/booking-api-server"
import { roomBelongsToTenant } from "@/lib/booking-tenant"
import { isValidRoomImages } from "@/lib/room-admin-validation.mjs"
import {
  isValidDestinationHighlights,
  MAX_DESTINATION_HIGHLIGHT_IMAGES_TOTAL_CHARS,
} from "@/lib/resort-highlights.mjs"

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
const BRANDING_FIELDS = [
  "name",
  "tagline",
  "logo",
  "favicon",
  "heroImageUrl",
  "heroOverlayOpacity",
  "aboutBody",
  "aboutHighlights",
  "destinationHighlights",
  "tabTitle",
  "address",
  "phone",
  "email",
  "facebook",
  "twitter",
  "linkedin",
]
const MAX_IMAGE_CHARS = 350_000
const MAX_BRANDING_STRING_CHARS = 520_000

function canManageRoom(user, room, legacyUid) {
  if (user.isLegacyAdmin && !room.ownerUid) return true
  return roomBelongsToTenant(room, user.ownerUid || user.uid, legacyUid)
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]))
}

function validString(value, maxLength) {
  return typeof value === "string" && value.length <= maxLength
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
  const allowedActions = new Set([
    "room.create",
    "room.update",
    "room.archive",
    "room.restore",
    "listing.save",
    "listing.publish",
    "branding.update",
    "payment-settings.update",
    "reminder-settings.update",
    "contact.status",
    "feedback.status",
  ])
  if (!allowedActions.has(action) || !isPlainObject(body)) {
    return jsonFailure("A valid admin mutation is required.", 400)
  }

  const user = authResult.user
  const ownerUid = user.ownerUid || user.uid
  const ownerOnlyActions = new Set([
    "listing.save",
    "listing.publish",
    "branding.update",
    "payment-settings.update",
    "reminder-settings.update",
  ])
  if (
    action.startsWith("room.")
    && !user.isOwner
    && !user.isLegacyAdmin
  ) return jsonFailure("Only the resort admin can manage rooms.", 403)
  if (ownerOnlyActions.has(action) && !user.isOwner) {
    return jsonFailure("Only the resort owner can update these settings.", 403)
  }
  if (
    !ownerOnlyActions.has(action)
    && !user.isOwner
    && !user.isLegacyAdmin
  ) {
    return jsonFailure("Only a resort admin can make this change.", 403)
  }

  try {
    const eventActor = auditActor(user, ownerUid)
    if (action.startsWith("room.")) {
      const roomId = String(body.roomId || "").trim()
      if (action !== "room.create" && (!roomId || roomId.includes("/") || roomId.length > 150)) {
        return jsonFailure("A valid room is required.", 400)
      }
      const roomRef = action === "room.create" ? db.collection("rooms").doc() : db.collection("rooms").doc(roomId)
      const legacyUid = await getLegacyRoomOwnerUid(db)
      const roomSnapshot = action === "room.create" ? null : await roomRef.get()
      if (roomSnapshot && !roomSnapshot.exists) return jsonFailure("Room not found.", 404)
      const before = roomSnapshot?.data() || {}
      if (roomSnapshot && !canManageRoom(user, before, legacyUid)) {
        return jsonFailure("You cannot manage this room.", 403)
      }
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
            before: {
              name: room.name,
              roomType: room.type,
              isArchived: room.isArchived === true,
            },
            after: { name: room.name, roomType: room.type, isArchived: archived },
          })
        })
        return Response.json({ success: true, roomId: roomRef.id, isArchived: action === "room.archive" })
      }

      const room = pick(isPlainObject(body.room) ? body.room : {}, ROOM_FIELDS)
      if (!isPlainObject(body.room) || !validRoom(room, before.images)) return jsonFailure("Room details are invalid.", 400)
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
          const latest = await transaction.get(roomRef)
          if (!latest.exists) {
            const error = new Error("Room not found.")
            error.status = 404
            throw error
          }
          latestBefore = latest.data()
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
    }

    if (action === "listing.save" || action === "listing.publish") {
      const listingRef = db.collection("resorts").doc(ownerUid)
      let updates
      if (action === "listing.save") {
        const listing = body.listing
        if (
          !isPlainObject(listing)
          || !validString(listing.name, 120)
          || !validString(listing.location, 300)
          || !validString(listing.mapsUrl, 2000)
          || !validString(listing.description, 3000)
          || !validString(listing.category, 80)
          || !validString(listing.listingImage, MAX_IMAGE_CHARS)
          || !Array.isArray(listing.tags)
          || listing.tags.length > 10
          || !listing.tags.every((tag) => validString(tag, 60))
        ) return jsonFailure("Marketplace listing details are invalid.", 400)
        updates = {
          ownerUid,
          name: listing.name.trim(),
          location: listing.location.trim(),
          mapsUrl: listing.mapsUrl.trim(),
          description: listing.description.trim(),
          category: listing.category.trim() || "Resort",
          listingImage: listing.listingImage.trim(),
          tags: listing.tags,
          updatedAt: new Date(),
        }
      } else {
        updates = { published: true, publishedAt: new Date(), updatedAt: new Date() }
      }
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(listingRef)
        if (action === "listing.publish" && String(current.get("status") || "").toLowerCase() !== "approved") {
          const error = new Error("Only approved resort listings can be published.")
          error.status = 409
          throw error
        }
        if (action === "listing.publish") {
          const ownerSnapshot = await transaction.get(db.collection("resortOwners").doc(ownerUid))
          const brandingSnapshot = await transaction.get(db.collection("resortOwners").doc(ownerUid).collection("site").doc("branding"))
          const roomSnapshot = await db.collection("rooms").where("ownerUid", "==", ownerUid).limit(1).get()
          const owner = ownerSnapshot.data() || {}
          const branding = brandingSnapshot.data() || {}
          if (
            String(owner.status || "").toLowerCase() !== "approved"
            || !String(branding.name || "").trim()
            || !String(branding.address || "").trim()
            || !String(branding.phone || "").trim()
            || !String(branding.email || "").trim()
            || roomSnapshot.empty
          ) {
            const error = new Error("Complete resort contact details and add at least one room before publishing.")
            error.status = 409
            throw error
          }
        }
        transaction.set(listingRef, updates, { merge: true })
        writeResortAdminAudit(transaction, db, {
          ...eventActor,
          action,
          entityType: "resort-listing",
          entityId: ownerUid,
          summary: action === "listing.save" ? "Marketplace listing details were saved." : "Marketplace listing was published.",
          before: pick(current.data() || {}, ["name", "location", "published"]),
          after: {
            ...pick(updates, ["name", "location", "published"]),
            listingImageConfigured: Boolean(updates.listingImage),
          },
        })
      })
      return Response.json({ success: true })
    }

    if (action === "branding.update") {
      const branding = pick(isPlainObject(body.branding) ? body.branding : {}, BRANDING_FIELDS)
      const stringFieldsValid = Object.entries(branding)
        .filter(([key]) => !["heroOverlayOpacity", "aboutHighlights", "destinationHighlights"].includes(key))
        .every(([, value]) => typeof value === "string" && value.length <= MAX_BRANDING_STRING_CHARS)
      const highlightsValid = !("aboutHighlights" in branding) || (
        Array.isArray(branding.aboutHighlights)
        && branding.aboutHighlights.length <= 3
        && branding.aboutHighlights.every((item) =>
          isPlainObject(item)
          && validString(item.title, 100)
          && validString(item.desc, 500),
        )
      )
      const destinationHighlightsValid = !("destinationHighlights" in branding)
        || isValidDestinationHighlights(branding.destinationHighlights)
      const overlayValid = !("heroOverlayOpacity" in branding)
        || (Number.isFinite(branding.heroOverlayOpacity) && branding.heroOverlayOpacity >= 0 && branding.heroOverlayOpacity <= 100)
      const brandImageChars = ["logo", "favicon", "heroImageUrl"]
        .reduce((total, key) => total + String(branding[key] || "").length, 0)
      const destinationImageChars = Array.isArray(branding.destinationHighlights)
        ? branding.destinationHighlights.reduce((total, highlight) => total + String(highlight?.image || "").length, 0)
        : 0
      const imageChars = brandImageChars + destinationImageChars
      if (
        !isPlainObject(body.branding)
        || !Object.keys(branding).length
        || !stringFieldsValid
        || !highlightsValid
        || !destinationHighlightsValid
        || !overlayValid
        || destinationImageChars > MAX_DESTINATION_HIGHLIGHT_IMAGES_TOTAL_CHARS
        || imageChars > 850_000
      ) {
        return jsonFailure("Branding details are invalid.", 400)
      }
      const brandingRef = db.collection("resortOwners").doc(ownerUid).collection("site").doc("branding")
      if (
        body.removeFields !== undefined
        && (!Array.isArray(body.removeFields) || !body.removeFields.every((field) => ["tabTitle", "favicon"].includes(field)))
      ) return jsonFailure("Branding fields to remove are invalid.", 400)
      const removeFields = body.removeFields || []
      const brandingUpdate = {
        ...branding,
        ...Object.fromEntries(removeFields.map((field) => [field, FieldValue.delete()])),
        updatedAt: new Date(),
      }
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(brandingRef)
        transaction.set(brandingRef, brandingUpdate, { merge: true })
        writeResortAdminAudit(transaction, db, {
          ...eventActor,
          action,
          entityType: "branding",
          entityId: "branding",
          summary: "Resort branding was updated.",
          before: {
            name: current.get("name"),
            logoConfigured: Boolean(current.get("logo")),
            heroImageConfigured: Boolean(current.get("heroImageUrl")),
            destinationHighlightCount: Array.isArray(current.get("destinationHighlights"))
              ? current.get("destinationHighlights").length
              : 0,
          },
          after: {
            name: branding.name,
            logoConfigured: Boolean(branding.logo),
            heroImageConfigured: Boolean(branding.heroImageUrl),
            destinationHighlightCount: Array.isArray(branding.destinationHighlights)
              ? branding.destinationHighlights.length
              : 0,
          },
        })
      })
      return Response.json({ success: true })
    }

    if (action === "payment-settings.update" || action === "reminder-settings.update") {
      const fields = action === "payment-settings.update"
        ? ["gcashQrImage", "paymentInstructions", "reservationDepositPercent"]
        : [
            "checkInInstructions",
            "resortRulesText",
            "wifiNetworkName",
            "wifiPassword",
            "wifiVoucherCode",
            "wifiInstructions",
          ]
      const updates = pick(isPlainObject(body.updates) ? body.updates : {}, fields)
      const settingsValid = action === "payment-settings.update"
        ? validString(updates.gcashQrImage, 520_000)
          && validString(updates.paymentInstructions, 2000)
          && Number.isInteger(updates.reservationDepositPercent)
          && updates.reservationDepositPercent >= 1
          && updates.reservationDepositPercent <= 100
        : validString(updates.checkInInstructions, 2000)
          && validString(updates.resortRulesText, 5000)
          && validString(updates.wifiNetworkName, 120)
          && validString(updates.wifiPassword, 200)
          && validString(updates.wifiVoucherCode, 120)
          && validString(updates.wifiInstructions, 1000)
      if (!isPlainObject(body.updates) || Object.keys(updates).length !== fields.length || !settingsValid) {
        return jsonFailure("Resort settings are invalid.", 400)
      }
      const ownerRef = db.collection("resortOwners").doc(ownerUid)
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(ownerRef)
        if (!current.exists || String(current.get("status") || "").toLowerCase() !== "approved") {
          const error = new Error("An approved resort is required to update these settings.")
          error.status = 403
          throw error
        }
        transaction.update(ownerRef, { ...updates, updatedAt: new Date() })
        writeResortAdminAudit(transaction, db, {
          ...eventActor,
          action,
          entityType: "resort-settings",
          entityId: ownerUid,
          summary: action === "payment-settings.update" ? "Resort payment settings were updated." : "Check-in instructions were updated.",
          before: action === "payment-settings.update"
            ? {
                gcashQrConfigured: Boolean(current.get("gcashQrImage")),
                paymentInstructionsConfigured: Boolean(current.get("paymentInstructions")),
                reservationDepositPercent: Number(current.get("reservationDepositPercent") || 30),
              }
            : {
                checkInInstructionsConfigured: Boolean(current.get("checkInInstructions")),
                resortRulesConfigured: Boolean(current.get("resortRulesText")),
                wifiConfigured: Boolean(current.get("wifiNetworkName") || current.get("wifiPassword") || current.get("wifiVoucherCode")),
              },
          after: action === "payment-settings.update"
            ? {
                gcashQrConfigured: Boolean(updates.gcashQrImage),
                paymentInstructionsConfigured: Boolean(updates.paymentInstructions),
                reservationDepositPercent: updates.reservationDepositPercent,
              }
            : {
                checkInInstructionsConfigured: Boolean(updates.checkInInstructions),
                resortRulesConfigured: Boolean(updates.resortRulesText),
                wifiConfigured: Boolean(updates.wifiNetworkName || updates.wifiPassword || updates.wifiVoucherCode),
              },
        })
      })
      return Response.json({ success: true })
    }

    const entityType = action === "contact.status" ? "contact-message" : "feedback"
    const collectionName = action === "contact.status" ? "contactMessages" : "feedbacks"
    const entityId = String(body.entityId || "").trim()
    const status = String(body.status || "").trim()
    const validStatuses = action === "contact.status"
      ? new Set(["Read", "Unread"])
      : new Set(["Published", "Hidden"])
    if (!entityId || entityId.includes("/") || entityId.length > 150 || !validStatuses.has(status)) {
      return jsonFailure("A valid record and status are required.", 400)
    }
    const recordRef = db.collection(collectionName).doc(entityId)
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(recordRef)
      if (!snapshot.exists) {
        const error = new Error("Record not found.")
        error.status = 404
        throw error
      }
      const record = snapshot.data()
      if (user.isLegacyAdmin ? Boolean(record.ownerUid) : record.ownerUid !== ownerUid) {
        const error = new Error("You cannot manage this record.")
        error.status = 403
        throw error
      }
      transaction.update(recordRef, { status, updatedAt: new Date() })
      writeResortAdminAudit(transaction, db, {
        ...eventActor,
        action,
        entityType,
        entityId,
        summary: action === "contact.status"
          ? `Contact message marked ${status.toLowerCase()}.`
          : `Guest feedback marked ${status.toLowerCase()}.`,
        before: { status: String(record.status || "") },
        after: { status },
      })
    })
    return Response.json({ success: true })
  } catch (error) {
    if (Number.isInteger(error?.status)) return jsonFailure(error.message, error.status)
    console.error("Failed to record resort admin mutation:", error)
    return jsonFailure("The requested change could not be saved.", 500)
  }
}
