import { FieldValue } from "firebase-admin/firestore"
import { getBookingDb } from "@/lib/booking-api-server"
import {
  hashBookingFeedbackToken,
  isFeedbackInviteActive,
  isValidBookingFeedbackToken,
  validateGuestFeedback,
} from "@/lib/booking-feedback.mjs"
import { writeResortAdminEvent } from "@/lib/resort-admin-events.mjs"

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 })
  }
  const token = String(body?.token || "")
  const rating = Number(body?.rating)
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  if (!isValidBookingFeedbackToken(token) || !validateGuestFeedback({ rating, message })) {
    return Response.json({ error: "A valid feedback link, rating, and message are required." }, { status: 400 })
  }

  try {
    const db = getBookingDb()
    if (!db) {
      return Response.json({ error: "Firebase Admin credentials are not configured." }, { status: 503 })
    }

    const tokenHash = hashBookingFeedbackToken(token)
    const tokenRef = db.collection("bookingFeedbackTokens").doc(tokenHash)
    const feedbackRef = db.collection("feedbacks").doc()
    const now = new Date()

    const result = await db.runTransaction(async (transaction) => {
      const inviteSnapshot = await transaction.get(tokenRef)
      if (!inviteSnapshot.exists) return { error: "This feedback link is invalid or expired.", status: 410 }

      const invite = inviteSnapshot.data()
      const bookingRef = db.collection("guestbooking").doc(String(invite.bookingId || ""))
      const ownerRef = db.collection("resortOwners").doc(String(invite.ownerUid || ""))
      const [bookingSnapshot, ownerSnapshot] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(ownerRef),
      ])
      const booking = bookingSnapshot.exists
        ? { id: bookingSnapshot.id, ...bookingSnapshot.data() }
        : null
      if (!isFeedbackInviteActive(invite, booking, now)) {
        return { error: "This feedback link has already been used or has expired.", status: 410 }
      }
      if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved") {
        return { error: "This resort is unavailable.", status: 410 }
      }

      transaction.create(feedbackRef, {
        ownerUid: invite.ownerUid,
        bookingId: booking.id,
        checkIn: String(booking.checkIn || ""),
        checkOut: String(booking.checkOut || ""),
        name: String(booking.name || "Guest").slice(0, 120),
        rating,
        message,
        status: "Hidden",
        submittedVia: "one-time-link",
        createdAt: now,
      })
      transaction.update(tokenRef, { usedAt: now })
      transaction.update(bookingRef, {
        feedbackSubmittedAt: now,
        feedbackTokenHash: FieldValue.delete(),
      })
      writeResortAdminEvent(transaction, db, {
        ownerUid: invite.ownerUid,
        actorUid: "guest",
        actorEmail: "",
        actorRole: "guest",
        action: "feedback.created",
        entityType: "feedback",
        entityId: feedbackRef.id,
        summary: "A checked-out guest submitted feedback.",
        after: { status: "Hidden" },
        notification: {
          type: "feedback.new",
          title: "New guest feedback",
          message: `New feedback (${rating}/5) was submitted for booking ${booking.id}.`,
        },
      })
      return { success: true }
    })

    if (result.error) {
      return Response.json({ error: result.error }, { status: result.status })
    }
    return Response.json({ success: true, message: "Thank you for sharing your feedback." })
  } catch (error) {
    console.error("Failed to submit one-time guest feedback:", error)
    return Response.json({ error: "Feedback could not be submitted. Please try again." }, { status: 500 })
  }
}
