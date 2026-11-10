import {
  authenticateBookingAdmin,
  hasBookingPermission,
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
    const params = new URL(request.url).searchParams
    const history = params.get("history") === "true"
    const payments = params.get("payments") === "true"
    const canAccess =
      payments
        ? hasBookingPermission(user, "payment") || hasBookingPermission(user, "booking")
        : history
          ? hasBookingPermission(user, "booking") || hasBookingPermission(user, "refund")
          : hasBookingPermission(user, "booking")
    if (!canAccess) {
      return jsonFailure("Your staff role cannot access these booking records.", 403)
    }
    const snapshot = user.isLegacyAdmin
      ? await db.collection("guestbooking").limit(1000).get()
      : await db.collection("guestbooking").where("ownerUid", "==", user.ownerUid).limit(1000).get()
    const bookings = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((booking) =>
        user.isLegacyAdmin
          ? !booking.ownerUid || booking.ownerUid === user.uid
          : booking.ownerUid === user.ownerUid,
      )
      .filter((booking) =>
        payments
          ? true
          : history
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
        const isOwner = user.isOwner && booking.ownerUid === user.ownerUid
        const canViewPaymentProof = hasBookingPermission(user, "payment")
        const rawPaymentStatus = String(booking.paymentStatus || "unpaid")
        return {
          ...safeBooking,
          paymentStatus: rawPaymentStatus === "submitted_for_review" ? "proof_submitted" : rawPaymentStatus,
          hasProofOfPayment: canViewPaymentProof && Boolean(proofOfPaymentImage || proofOfPaymentUrl),
          hasValidId: isOwner && booking.status !== "Completed" && Boolean(validIdImage || validIdUrl),
          createdAt: booking.createdAt?.toDate?.().toISOString() || null,
          updatedAt: booking.updatedAt?.toDate?.().toISOString() || null,
          paymentReviewedAt: booking.paymentReviewedAt?.toDate?.().toISOString() || null,
          checkedInAt: booking.checkedInAt?.toDate?.().toISOString() || null,
          checkedOutAt: booking.checkedOutAt?.toDate?.().toISOString() || null,
          cancellationRecordedAt: booking.cancellationRecordedAt?.toDate?.().toISOString() || null,
          refundRecordedAt: booking.refundRecordedAt?.toDate?.().toISOString() || null,
        }
      })
    return Response.json({ bookings })
  } catch (error) {
    console.error("Failed to load bookings:", error)
    return jsonFailure("Failed to load bookings.", 500)
  }
}