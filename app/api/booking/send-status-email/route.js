import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"
import { renderBookingEmailLayout } from "@/lib/booking-email-layout"

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
  const bookingId = String(body?.bookingId || "").trim()
  const type = String(body?.type || "booking").trim()
  if (!bookingId) return jsonFailure("Booking ID is required.", 400)
  if (!["booking", "payment"].includes(type)) return jsonFailure("Email type is invalid.", 400)

  try {
    const snapshot = await db.collection("guestbooking").doc(bookingId).get()
    if (!snapshot.exists) return jsonFailure("Booking not found.", 404)
    const booking = snapshot.data()
    if (!canManageBooking(authResult.user, booking)) return jsonFailure("You cannot manage this booking.", 403)

    const mail = await resolveCentralEnvMail()
    if (!mail.ok) {
      console.error("Booking status email unavailable:", mail.code, mail.message)
      return jsonFailure("Booking status email is not configured.", 503)
    }

    const status = String(booking.status || "Pending")
    const paymentStatus = String(booking.paymentStatus || "unpaid")
    const message =
      type === "payment"
        ? {
            paid: `Your GCash payment for booking ${bookingId} has been verified.`,
            rejected: `Your payment proof for booking ${bookingId} could not be verified. Please contact the resort for assistance.`,
          }[paymentStatus]
        : {
            Approved: `Your booking for ${booking.roomType} from ${booking.checkIn} to ${booking.checkOut} is approved.`,
            Declined: `Unfortunately, your booking request for ${booking.roomType} from ${booking.checkIn} to ${booking.checkOut} was declined.`,
            Cancelled: `Your booking for ${booking.roomType} from ${booking.checkIn} to ${booking.checkOut} has been cancelled.`,
            Completed: `Your stay at ${booking.roomType} from ${booking.checkIn} to ${booking.checkOut} is marked complete.`,
            Pending: `Your booking request for ${booking.roomType} from ${booking.checkIn} to ${booking.checkOut} is pending review.`,
          }[status]
    if (!message) return jsonFailure("No status email is available for this booking.", 400)

    await mail.transporter.sendMail({
      from: `"${mail.brandName}" <${mail.user}>`,
      to: booking.email,
      replyTo: mail.replyTo,
      subject: type === "payment" ? `Payment update: ${paymentStatus}` : `Booking update: ${status}`,
      text: `${message}\nBooking reference: ${bookingId}`,
      html: renderBookingEmailLayout({
        title: type === "payment" ? `Payment ${paymentStatus}` : `Booking ${status.toLowerCase()}`,
        greeting: `Hello ${booking.name || "Guest"},`,
        message: `${message} Booking reference: ${bookingId}.`,
        brandName: mail.brandName,
      }),
    })
    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to send booking status email:", error)
    return jsonFailure("Failed to send booking status email.", 502)
  }
}