import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
} from "@/lib/booking-api-server"
import { renderBookingEmailLayout } from "@/lib/booking-email-layout"
import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"

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
  if (
    !hasBookingPermission(authResult.user, type === "booking" ? "booking" : "payment") &&
    !(type === "payment" && hasBookingPermission(authResult.user, "booking"))
  ) {
    return jsonFailure("Your staff role cannot send this email.", 403)
  }

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
    const paymentMethod = String(booking.paymentMethod || "gcash")
    const message =
      type === "payment"
        ? {
            paid: `Your ${paymentMethod === "cash" ? "cash payment" : "GCash payment"} for booking ${bookingId} has been recorded as paid.`,
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

    if (!booking.email) return jsonFailure("This booking has no guest email address.", 409)
    const resortRules =
      type === "booking" && status === "Approved" && booking.ownerUid
        ? String((await db.collection("resortOwners").doc(String(booking.ownerUid)).get()).get("resortRulesText") || "").trim()
        : ""
    const details = resortRules
      ? [{ title: "Resort rules and regulations", body: resortRules }]
      : []
    await mail.transporter.sendMail({
      from: `"${mail.brandName}" <${mail.user}>`,
      to: booking.email,
      replyTo: mail.replyTo,
      subject: type === "payment" ? `Payment update: ${paymentStatus}` : `Booking update: ${status}`,
      text: `${message}\nBooking reference: ${bookingId}${details.length
        ? `\n\n${details.map((detail) => `${detail.title}:\n${detail.body}`).join("\n\n")}`
        : ""}`,
      html: renderBookingEmailLayout({
        title: type === "payment" ? `Payment ${paymentStatus}` : `Booking ${status.toLowerCase()}`,
        greeting: `Hello ${booking.name || "Guest"},`,
        message: `${message} Booking reference: ${bookingId}.`,
        brandName: mail.brandName,
        details,
      }),
    })
    if (type === "booking" && status === "Approved") {
      const bookingRef = db.collection("guestbooking").doc(bookingId)
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(bookingRef)
        if (!current.exists || !canManageBooking(authResult.user, current.data())) {
          throw new Error("BOOKING_ACCESS_CHANGED")
        }
        transaction.update(bookingRef, {
          confirmationEmailSentAt: new Date(),
          confirmationEmailSentBy: authResult.user.uid,
          "reminderEmails.confirmation": {
            status: "sent",
            sentAt: new Date(),
          },
        })
        writeResortAdminAudit(transaction, db, {
          ownerUid: String(current.get("ownerUid") || authResult.user.ownerUid || authResult.user.uid),
          actorUid: authResult.user.uid,
          actorEmail: authResult.user.email,
          actorRole: authResult.user.staffRole,
          action: "booking.confirmation-email-sent",
          entityType: "booking",
          entityId: bookingId,
          summary: "Booking confirmation email was sent successfully.",
        })
      })
    }
    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to send booking status email:", error)
    return jsonFailure("Failed to send booking status email.", 502)
  }
}