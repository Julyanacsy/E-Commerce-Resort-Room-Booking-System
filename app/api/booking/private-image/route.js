import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
} from "@/lib/booking-api-server"

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)

  const params = new URL(request.url).searchParams
  const bookingId = String(params.get("bookingId") || "").trim()
  const type = String(params.get("type") || "").trim()
  if (!bookingId || !["proof", "id"].includes(type)) {
    return jsonFailure("Booking and image type are required.", 400)
  }
  if (type === "id" && !authResult.user.isOwner) {
    return jsonFailure("Only the resort owner may view a guest ID.", 403)
  }
  if (type === "proof" && !hasBookingPermission(authResult.user, "payment")) {
    return jsonFailure("Your staff role cannot view payment proof.", 403)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const bookingSnapshot = await db.collection("guestbooking").doc(bookingId).get()
    if (!bookingSnapshot.exists) return jsonFailure("Booking not found.", 404)

    const booking = bookingSnapshot.data()
    if (!canManageBooking(authResult.user, booking)) {
      return jsonFailure("You cannot view booking uploads.", 403)
    }
    if (type === "id" && booking.status === "Completed") {
      return jsonFailure("Guest ID images are unavailable for completed bookings.", 404)
    }

    const image =
      type === "proof"
        ? String(booking.proofOfPaymentImage || booking.proofOfPaymentUrl || "")
        : String(booking.validIdImage || booking.validIdUrl || "")
    if (!image) return jsonFailure("Image not found.", 404)

    return Response.json({ image }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load private booking image:", error)
    return jsonFailure("Booking image could not be loaded.", 500)
  }
}
