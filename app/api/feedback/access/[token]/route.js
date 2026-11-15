import {
  hashBookingFeedbackToken,
  isFeedbackInviteActive,
  isValidBookingFeedbackToken,
} from "@/lib/booking-feedback.mjs"
import { getBookingDb, jsonFailure } from "@/lib/booking-api-server"

export async function GET(_request, { params }) {
  const { token } = await params
  if (!isValidBookingFeedbackToken(token)) return jsonFailure("This feedback link is invalid or expired.", 410)

  const db = getBookingDb()
  if (!db) return jsonFailure("Feedback is temporarily unavailable.", 503)

  try {
    const tokenHash = hashBookingFeedbackToken(token)
    const inviteSnapshot = await db.collection("bookingFeedbackTokens").doc(tokenHash).get()
    if (!inviteSnapshot.exists) return jsonFailure("This feedback link is invalid or expired.", 410)

    const invite = inviteSnapshot.data()
    const bookingSnapshot = await db.collection("guestbooking").doc(String(invite.bookingId || "")).get()
    const booking = bookingSnapshot.exists
      ? { id: bookingSnapshot.id, ...bookingSnapshot.data() }
      : null
    if (!isFeedbackInviteActive(invite, booking)) {
      return jsonFailure("This feedback link has already been used or has expired.", 410)
    }

    const ownerSnapshot = await db.collection("resortOwners").doc(invite.ownerUid).get()
    if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved") {
      return jsonFailure("This feedback link is no longer available.", 410)
    }
    const brandingSnapshot = await db
      .collection("resortOwners")
      .doc(invite.ownerUid)
      .collection("site")
      .doc("branding")
      .get()
    const resortName = String(brandingSnapshot.get("name") || "the resort").slice(0, 120)

    return Response.json({
      valid: true,
      guestName: String(booking.name || "Guest").slice(0, 120),
      resortName,
      checkIn: String(booking.checkIn || ""),
      checkOut: String(booking.checkOut || ""),
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to validate guest feedback link:", error)
    return jsonFailure("This feedback link could not be verified.", 500)
  }
}
