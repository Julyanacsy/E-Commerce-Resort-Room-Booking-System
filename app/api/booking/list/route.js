import {
  authenticateBookingAdmin,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const { user } = authResult
    const snapshot = user.isLegacyAdmin
      ? await db.collection("guestbooking").limit(1000).get()
      : await db.collection("guestbooking").where("ownerUid", "==", user.uid).limit(1000).get()
    const history = new URL(request.url).searchParams.get("history") === "true"
    const bookings = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((booking) =>
        user.isLegacyAdmin
          ? !booking.ownerUid || booking.ownerUid === user.uid
          : booking.ownerUid === user.uid,
      )
      .filter((booking) =>
        history
          ? ["Completed", "Declined", "Cancelled"].includes(String(booking.status || ""))
          : !["Completed", "Declined", "Cancelled"].includes(String(booking.status || "")),
      )
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .map((booking) => {
        const {
          proofOfPaymentImage,
          proofOfPaymentUrl,
          validIdImage,
          validIdUrl,
          ...safeBooking
        } = booking
        const isOwner = booking.ownerUid === user.uid
        const rawPaymentStatus = String(booking.paymentStatus || "unpaid")
        return {
          ...safeBooking,
          paymentStatus: rawPaymentStatus === "submitted_for_review" ? "proof_submitted" : rawPaymentStatus,
          hasProofOfPayment: isOwner && Boolean(proofOfPaymentImage || proofOfPaymentUrl),
          hasValidId: isOwner && booking.status !== "Completed" && Boolean(validIdImage || validIdUrl),
          createdAt: booking.createdAt?.toDate?.().toISOString() || null,
          updatedAt: booking.updatedAt?.toDate?.().toISOString() || null,
        }
      })
    return Response.json({ bookings })
  } catch (error) {
    console.error("Failed to load bookings:", error)
    return jsonFailure("Failed to load bookings.", 500)
  }
}