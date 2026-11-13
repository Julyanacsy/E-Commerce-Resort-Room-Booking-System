import { writeResortAdminAudit, writeResortAdminNotification } from "@/lib/resort-admin-events.mjs"
import {
  authenticateBookingAdmin,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
} from "@/lib/booking-api-server"
import { escapeLostFoundHtml, validateFoundItem } from "@/lib/lost-and-found.mjs"
import { sendLostFoundEmail } from "@/lib/lost-found-mail"

const MAX_ITEMS = 100
const MAX_CLAIMS_PER_ITEM = 50

function collectionFor(db, ownerUid) {
  return db.collection("resortOwners").doc(ownerUid).collection("lostAndFound")
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
  if (!authResult.user.ownerUid || !hasBookingPermission(authResult.user, "lost-found")) {
    return jsonFailure("Lost and Found is available to resort owners, Admin staff, and Front desk staff.", 403)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const snapshot = await collectionFor(db, authResult.user.ownerUid)
      .orderBy("createdAt", "desc")
      .limit(MAX_ITEMS)
      .get()
    const items = await Promise.all(snapshot.docs.map(async (doc) => {
      const claimsSnapshot = await doc.ref.collection("claims")
        .orderBy("createdAt", "desc")
        .limit(MAX_CLAIMS_PER_ITEM)
        .get()
      const claims = await Promise.all(claimsSnapshot.docs.map(async (claim) => {
        const messagesSnapshot = await claim.ref.collection("messages")
          .orderBy("createdAt", "asc")
          .limit(100)
          .get()
        const claimData = claim.data()
        delete claimData.accessTokenHash
        return {
          id: claim.id,
          ...claimData,
          createdAt: claim.get("createdAt")?.toDate?.().toISOString() || null,
          checkedInAt: claim.get("checkedInAt")?.toDate?.().toISOString() || null,
          checkedOutAt: claim.get("checkedOutAt")?.toDate?.().toISOString() || null,
          messages: messagesSnapshot.docs.map((message) => ({
            id: message.id,
            ...message.data(),
            createdAt: message.get("createdAt")?.toDate?.().toISOString() || null,
          })),
        }
      }))
      return {
        id: doc.id,
        ...doc.data(),
        pickupLocation: String(doc.get("pickupLocation") || "Front Desk"),
        claims,
        createdAt: doc.get("createdAt")?.toDate?.().toISOString() || null,
        claimedAt: doc.get("claimedAt")?.toDate?.().toISOString() || null,
      }
    }))
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load resort lost-and-found items:", error)
    return jsonFailure("Lost and Found items could not be loaded.", 500)
  }
}

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!authResult.user.ownerUid || !hasBookingPermission(authResult.user, "lost-found")) {
    return jsonFailure("Lost and Found is available to resort owners, Admin staff, and Front desk staff.", 403)
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
  const ownerItems = collectionFor(db, authResult.user.ownerUid)
  const itemId = String(body?.itemId || "").trim()
  if (!["item.create", "item.mark-claimed", "claim.approve", "claim.reject", "claim.reply"].includes(action)) {
    return jsonFailure("A valid Lost and Found action is required.", 400)
  }
  if (action !== "item.create" && (!itemId || itemId.includes("/") || itemId.length > 150)) {
    return jsonFailure("A valid found item is required.", 400)
  }

  const itemRef = action === "item.create" ? ownerItems.doc() : ownerItems.doc(itemId)
  const actor = auditActor(authResult.user)

  try {
    if (action === "item.create") {
      if (!validateFoundItem(body.item)) {
        return jsonFailure("Enter a description, valid found date, location, and a supported photo that fits the upload limit.", 400)
      }
      const item = {
        description: body.item.description.trim(),
        foundDate: body.item.foundDate,
        location: body.item.location.trim(),
        pickupLocation: String(body.item.pickupLocation || "Front Desk").trim() || "Front Desk",
        photo: body.item.photo,
        status: "found",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: authResult.user.uid,
      }
      await db.runTransaction(async (transaction) => {
        transaction.create(itemRef, item)
        writeResortAdminAudit(transaction, db, {
          ...actor,
          action: "lost-found.item-created",
          entityType: "lost-found-item",
          entityId: itemRef.id,
          summary: "A found item was added to Lost and Found.",
          after: { description: item.description, foundDate: item.foundDate, location: item.location, status: item.status },
        })
      })
      return Response.json({ success: true, itemId: itemRef.id })
    }

    const claimId = String(body?.claimId || "").trim()
    if (["claim.approve", "claim.reject", "claim.reply"].includes(action)
      && (!claimId || claimId.includes("/") || claimId.length > 150)) {
      return jsonFailure("A valid claim is required.", 400)
    }
    const claimRef = claimId ? itemRef.collection("claims").doc(claimId) : null
    if (action === "claim.reply") {
      const reply = typeof body?.message === "string" ? body.message.trim() : ""
      if (!reply || reply.length > 1000) return jsonFailure("Enter a reply of up to 1,000 characters.", 400)
      const messageRef = claimRef.collection("messages").doc()
      let guestEmail = ""
      let guestName = ""
      let itemDescription = ""
      await db.runTransaction(async (transaction) => {
        const [itemSnapshot, claimSnapshot] = await Promise.all([
          transaction.get(itemRef),
          transaction.get(claimRef),
        ])
        if (!itemSnapshot.exists || !claimSnapshot.exists) {
          const error = new Error("Claim or found item not found.")
          error.status = 404
          throw error
        }
        guestEmail = String(claimSnapshot.get("email") || "")
        guestName = String(claimSnapshot.get("name") || "Guest")
        itemDescription = String(itemSnapshot.get("description") || "found item")
        transaction.create(messageRef, {
          authorRole: "staff",
          authorName: authResult.user.email || "Resort Staff",
          message: reply,
          createdAt: new Date(),
        })
        transaction.update(claimRef, { lastMessageAt: new Date() })
        writeResortAdminAudit(transaction, db, {
          ...actor,
          action: "lost-found-claim.staff-reply",
          entityType: "lost-found-claim",
          entityId: claimId,
          summary: "Resort staff replied to a Lost and Found claim.",
          after: { status: "message-sent" },
        })
      })

      const safeName = escapeLostFoundHtml(guestName)
      const safeMessage = escapeLostFoundHtml(reply)
      const emailSent = await sendLostFoundEmail({
        to: guestEmail,
        subject: `Update about your ${itemDescription} claim`,
        replyTo: authResult.user.email,
        text: `Hello ${guestName},\n\nResort staff replied to your Lost and Found claim for "${itemDescription}":\n\n${reply}\n\nLog in to your claim conversation to reply.`,
        html: `<p>Hello ${safeName},</p><p>Resort staff replied to your Lost and Found claim for <strong>${escapeLostFoundHtml(itemDescription)}</strong>:</p><blockquote style="white-space:pre-wrap">${safeMessage}</blockquote><p>Open your claim conversation on the resort website to reply.</p>`,
      })
      return Response.json({ success: true, emailSent })
    }

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(itemRef)
      if (!current.exists) {
        const error = new Error("Found item not found.")
        error.status = 404
        throw error
      }
      const before = current.data()
      if (before.status === "claimed") {
        const error = new Error("This found item is already marked as claimed.")
        error.status = 409
        throw error
      }

      if (action === "item.mark-claimed") {
        transaction.update(itemRef, {
          status: "claimed",
          claimedAt: new Date(),
          claimedBy: authResult.user.uid,
          updatedAt: new Date(),
        })
      } else {
        const claimSnapshot = await transaction.get(claimRef)
        if (!claimSnapshot.exists) {
          const error = new Error("Claim not found.")
          error.status = 404
          throw error
        }
        if (claimSnapshot.get("status") !== "pending") {
          const error = new Error("This claim has already been reviewed.")
          error.status = 409
          throw error
        }
        const approved = action === "claim.approve"
        const replyMessage = approved
          ? `Your claim was approved. Please collect the item from ${String(before.pickupLocation || "Front Desk")} during your visit. Show your booking reference to resort staff; the item will be marked collected at handoff.`
          : "Your claim was reviewed and could not be approved. Please reply to this message or contact the resort if you believe this is an error."
        transaction.update(claimRef, {
          status: approved ? "approved" : "rejected",
          reviewedAt: new Date(),
          reviewedBy: authResult.user.uid,
          lastMessageAt: new Date(),
        })
        const replyRef = claimRef.collection("messages").doc()
        transaction.create(replyRef, {
          authorRole: "staff",
          authorName: authResult.user.email || "Resort Staff",
          message: replyMessage,
          createdAt: new Date(),
        })
        if (approved) {
          if (before.status !== "found") {
            const error = new Error("This item is already reserved for another approved claim.")
            error.status = 409
            throw error
          }
          transaction.update(itemRef, {
            status: "reserved",
            reservedClaimId: claimId,
            updatedAt: new Date(),
          })
        }
      }

      writeResortAdminAudit(transaction, db, {
        ...actor,
        action: action.replace(".", "-"),
        entityType: action.startsWith("claim.") ? "lost-found-claim" : "lost-found-item",
        entityId: action.startsWith("claim.") ? claimId : itemRef.id,
        summary: action === "claim.approve"
          ? "A Lost and Found claim was approved and the item reserved for pickup."
          : action === "claim.reject"
            ? "A Lost and Found claim was rejected."
            : "A found item was marked as collected by resort staff.",
        before: { description: before.description, location: before.location, status: before.status },
        after: {
          description: before.description,
          location: before.location,
          status: action === "claim.approve" ? "reserved" : action === "claim.reject" ? before.status : "claimed",
        },
      })
    })
    let emailSent
    if (action === "claim.approve" || action === "claim.reject") {
      try {
        const [claimSnapshot, itemSnapshot] = await Promise.all([claimRef.get(), itemRef.get()])
        const guestName = String(claimSnapshot.get("name") || "Guest")
        const itemDescription = String(itemSnapshot.get("description") || "found item")
        const pickupLocation = String(itemSnapshot.get("pickupLocation") || "Front Desk")
        const approved = action === "claim.approve"
        const message = approved
          ? `Your claim was approved. Please collect the item from ${pickupLocation} during your visit. Show your booking reference to resort staff; the item will be marked collected at handoff.`
          : "Your claim was reviewed and could not be approved. Please reply to the claim conversation or contact the resort if you believe this is an error."
        emailSent = await sendLostFoundEmail({
          to: claimSnapshot.get("email"),
          subject: `Update about your ${itemDescription} claim`,
          replyTo: authResult.user.email,
          text: `Hello ${guestName},\n\n${message}`,
          html: `<p>Hello ${escapeLostFoundHtml(guestName)},</p><p>${escapeLostFoundHtml(message)}</p>`,
        })
      } catch (emailError) {
        console.error("Could not send Lost and Found claim decision email:", emailError)
        emailSent = false
      }
    }
    return Response.json({
      success: true,
      status: action === "claim.approve" ? "reserved" : action === "claim.reject" ? "rejected" : "claimed",
      ...(emailSent === undefined ? {} : { emailSent }),
    })
  } catch (error) {
    console.error(`Failed to perform Lost and Found action "${action}":`, error)
    return jsonFailure(error.status ? error.message : "The Lost and Found update could not be saved.", error.status || 500)
  }
}
