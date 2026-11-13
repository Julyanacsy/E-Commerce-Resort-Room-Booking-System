import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { getBookingDb, jsonFailure } from "@/lib/booking-api-server"
import {
  escapeLostFoundHtml,
  isVerifiedLostItemBooking,
  validateLostItemClaim,
} from "@/lib/lost-and-found.mjs"
import { writeResortAdminNotification } from "@/lib/resort-admin-events.mjs"
import { getLostFoundStaffInboxEmail, sendLostFoundEmail } from "@/lib/lost-found-mail"

const MAX_PUBLIC_ITEMS = 50

function foundItems(db, ownerUid) {
  return db.collection("resortOwners").doc(ownerUid).collection("lostAndFound")
}

function isValidOwnerUid(value) {
  return typeof value === "string" && value.trim().length > 0
    && value.length <= 128 && !value.includes("/")
}

function validDocumentId(value) {
  return typeof value === "string" && value.trim().length > 0
    && value.length <= 150 && !value.includes("/")
}

function hashAccessToken(value) {
  return createHash("sha256").update(value).digest("hex")
}

function matchesAccessToken(value, storedHash) {
  if (typeof value !== "string" || value.length < 40 || typeof storedHash !== "string") return false
  const candidate = Buffer.from(hashAccessToken(value), "hex")
  const expected = Buffer.from(storedHash, "hex")
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export async function GET(request) {
  const params = new URL(request.url).searchParams
  const ownerUid = params.get("ownerUid")?.trim() || ""
  if (!isValidOwnerUid(ownerUid)) return jsonFailure("A valid resort is required.", 400)
  const db = getBookingDb()
  if (!db) return jsonFailure("Lost and Found is temporarily unavailable.", 503)
  try {
    const owner = await db.collection("resortOwners").doc(ownerUid).get()
    if (!owner.exists || String(owner.get("status") || "").toLowerCase() !== "approved") {
      return jsonFailure("This resort is not available.", 404)
    }
    const snapshot = await foundItems(db, ownerUid)
      .where("status", "==", "found")
      .limit(MAX_PUBLIC_ITEMS * 2)
      .get()
    const items = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        description: String(doc.get("description") || ""),
        foundDate: String(doc.get("foundDate") || ""),
        location: String(doc.get("location") || ""),
        pickupLocation: String(doc.get("pickupLocation") || "Front Desk"),
        photo: String(doc.get("photo") || ""),
      }))
      .sort((a, b) => b.foundDate.localeCompare(a.foundDate))
      .slice(0, MAX_PUBLIC_ITEMS)
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load public lost-and-found list:", error)
    return jsonFailure("Lost and Found items could not be loaded.", 500)
  }
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid claim request.", 400)
  }
  const ownerUid = String(body?.ownerUid || "").trim()
  const itemId = String(body?.itemId || "").trim()
  if (!isValidOwnerUid(ownerUid) || !validDocumentId(itemId)) {
    return jsonFailure("A valid resort and found item are required.", 400)
  }
  if (body.action === "claim.thread") {
    const claimId = String(body?.claimId || "")
    const accessToken = String(body?.token || "")
    if (!validDocumentId(claimId)) return jsonFailure("A valid claim is required.", 400)
    const db = getBookingDb()
    if (!db) return jsonFailure("Claim messages are temporarily unavailable.", 503)
    try {
      const ownerSnapshot = await db.collection("resortOwners").doc(ownerUid).get()
      if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved") {
        return jsonFailure("This resort is not available.", 404)
      }
      const claimRef = foundItems(db, ownerUid).doc(itemId).collection("claims").doc(claimId)
      const claimSnapshot = await claimRef.get()
      if (!claimSnapshot.exists || !matchesAccessToken(accessToken, claimSnapshot.get("accessTokenHash"))) {
        return jsonFailure("This claim conversation is unavailable.", 404)
      }
      const messagesSnapshot = await claimRef.collection("messages")
        .orderBy("createdAt", "asc")
        .limit(100)
        .get()
      return Response.json({
        claim: {
          id: claimId,
          status: String(claimSnapshot.get("status") || "pending"),
          pickupLocation: String(claimSnapshot.get("pickupLocation") || "Front Desk"),
        },
        messages: messagesSnapshot.docs.map((message) => ({
          id: message.id,
          authorRole: String(message.get("authorRole") || "staff"),
          authorName: String(message.get("authorRole") === "staff" ? "Resort Staff" : "You"),
          message: String(message.get("message") || ""),
          createdAt: message.get("createdAt")?.toDate?.().toISOString() || null,
        })),
      }, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
      console.error("Failed to load public Lost and Found claim messages:", error)
      return jsonFailure("Claim messages could not be loaded.", 500)
    }
  }

  if (body.action === "claim.reply") {
    const claimId = String(body?.claimId || "")
    const message = typeof body?.message === "string" ? body.message.trim() : ""
    const accessToken = String(body?.token || "")
    if (!validDocumentId(claimId) || !message || message.length > 1000) {
      return jsonFailure("Enter a reply of up to 1,000 characters.", 400)
    }

    const db = getBookingDb()
    if (!db) return jsonFailure("Claim messages are temporarily unavailable.", 503)
    const claimRef = foundItems(db, ownerUid).doc(itemId).collection("claims").doc(claimId)
    const messageRef = claimRef.collection("messages").doc()
    try {
      await db.runTransaction(async (transaction) => {
        const [ownerSnapshot, itemSnapshot, claimSnapshot] = await Promise.all([
          transaction.get(db.collection("resortOwners").doc(ownerUid)),
          transaction.get(foundItems(db, ownerUid).doc(itemId)),
          transaction.get(claimRef),
        ])
        if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved"
          || !itemSnapshot.exists || !claimSnapshot.exists
          || !matchesAccessToken(accessToken, claimSnapshot.get("accessTokenHash"))) {
          const error = new Error("This claim conversation is unavailable.")
          error.status = 404
          throw error
        }
        transaction.create(messageRef, {
          authorRole: "guest",
          authorName: "Guest",
          message,
          createdAt: new Date(),
        })
        transaction.update(claimRef, { lastMessageAt: new Date() })
        writeResortAdminNotification(transaction, db, {
          ownerUid,
          type: "lost-found-claim-message",
          title: "Guest replied to a Lost and Found claim",
          message: `A verified guest sent a new message about ${String(itemSnapshot.get("description") || "a found item").slice(0, 180)}.`,
          entityType: "lost-found-claim",
          entityId: claimId,
        })
      })
      return Response.json({ success: true })
    } catch (error) {
      console.error("Failed to save public Lost and Found claim reply:", error)
      return jsonFailure(error.status ? error.message : "Your message could not be sent.", error.status || 500)
    }
  }

  if (!validateLostItemClaim(body.claim)) {
    return jsonFailure("Enter your name, a valid email address, contact number, and an optional message.", 400)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Claims are temporarily unavailable.", 503)
  const ownerRef = db.collection("resortOwners").doc(ownerUid)
  const itemRef = foundItems(db, ownerUid).doc(itemId)
  const claimRef = itemRef.collection("claims").doc()
  const firstMessageRef = claimRef.collection("messages").doc()
  const accessToken = randomBytes(32).toString("base64url")
  let pickupLocation = "Front Desk"
  let itemDescription = "found item"
  let itemLocation = ""
  try {
    await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection("guestbooking").doc(body.claim.reservationId)
      const [ownerSnapshot, itemSnapshot, bookingSnapshot] = await Promise.all([
        transaction.get(ownerRef),
        transaction.get(itemRef),
        transaction.get(bookingRef),
      ])
      if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved") {
        const error = new Error("This resort is not available.")
        error.status = 404
        throw error
      }
      if (!itemSnapshot.exists || itemSnapshot.get("status") !== "found") {
        const error = new Error("This item is no longer available to claim.")
        error.status = 409
        throw error
      }
      if (
        !bookingSnapshot.exists
        || String(bookingSnapshot.get("ownerUid") || "") !== ownerUid
        || !isVerifiedLostItemBooking(body.claim, itemSnapshot.data(), bookingSnapshot.data())
      ) {
        const error = new Error("We could not verify a completed stay for these details. Check your booking reference, guest contact, and check-in/check-out dates, then contact the resort front desk if you need help.")
        error.status = 403
        throw error
      }

      pickupLocation = String(itemSnapshot.get("pickupLocation") || "Front Desk")
      itemDescription = String(itemSnapshot.get("description") || itemDescription)
      itemLocation = String(itemSnapshot.get("location") || "")
      transaction.create(claimRef, {
        name: body.claim.name.trim(),
        email: body.claim.email.trim().toLowerCase(),
        contact: body.claim.contact.trim(),
        reservationId: body.claim.reservationId,
        checkIn: body.claim.checkIn,
        checkOut: body.claim.checkOut,
        checkedInAt: bookingSnapshot.get("checkedInAt"),
        checkedOutAt: bookingSnapshot.get("checkedOutAt"),
        stayVerified: true,
        pickupLocation,
        message: String(body.claim.message || "").trim(),
        status: "pending",
        accessTokenHash: hashAccessToken(accessToken),
        createdAt: new Date(),
      })
      if (String(body.claim.message || "").trim()) {
        transaction.create(firstMessageRef, {
          authorRole: "guest",
          authorName: body.claim.name.trim(),
          message: String(body.claim.message).trim(),
          createdAt: new Date(),
        })
      }
      transaction.update(itemRef, {
        claimCount: (Number(itemSnapshot.get("claimCount")) || 0) + 1,
        updatedAt: new Date(),
      })
      writeResortAdminNotification(transaction, db, {
        ownerUid,
        type: "lost-found-claim",
        title: "New verified Lost and Found claim",
        message: `${body.claim.name.trim()} submitted a verified-stay claim for ${String(itemSnapshot.get("description") || "a found item").slice(0, 140)}.`,
        entityType: "lost-found-claim",
        entityId: claimRef.id,
      })
    })

    let emailSent = false
    const staffEmail = await getLostFoundStaffInboxEmail(db, ownerUid)
    if (staffEmail) {
      const guestName = escapeLostFoundHtml(body.claim.name)
      const safeItem = escapeLostFoundHtml(body.claim.message || "Guest submitted a verified lost-item claim.")
      emailSent = await sendLostFoundEmail({
        to: staffEmail,
        subject: `New verified claim: ${itemDescription}`,
        replyTo: body.claim.email,
        text: `A verified guest submitted a claim for: ${itemDescription}\nFound at: ${itemLocation}\nGuest: ${body.claim.name}\nBooking reference: ${body.claim.reservationId}\nStay: ${body.claim.checkIn} to ${body.claim.checkOut}\nGuest message: ${body.claim.message || "(none)"}\nOpen the resort admin Lost and Found page to review and reply.`,
        html: `<p>A verified guest submitted a claim for <strong>${escapeLostFoundHtml(itemDescription)}</strong>.</p><p><strong>Found at:</strong> ${escapeLostFoundHtml(itemLocation)}<br><strong>Guest:</strong> ${guestName}<br><strong>Booking reference:</strong> ${escapeLostFoundHtml(body.claim.reservationId)}<br><strong>Stay:</strong> ${escapeLostFoundHtml(body.claim.checkIn)} to ${escapeLostFoundHtml(body.claim.checkOut)}</p><p><strong>Guest message:</strong><br>${safeItem}</p><p>Open the resort admin Lost and Found page to review and reply.</p>`,
      })
    }
    return Response.json({
      success: true,
      claimId: claimRef.id,
      token: accessToken,
      emailSent,
      message: emailSent
        ? `Your completed stay was verified and your claim was emailed to resort staff. Please collect the item from ${pickupLocation} only after staff confirms.`
        : `Your verified claim is saved in the resort staff Lost and Found inbox, but the staff email alert could not be sent. Please contact the front desk if urgent. Pickup point: ${pickupLocation}.`,
    })
  } catch (error) {
    console.error("Failed to submit public lost-item claim:", error)
    return jsonFailure(error.status ? error.message : "Your claim could not be submitted. Please try again.", error.status || 500)
  }
}
