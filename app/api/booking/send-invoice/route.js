import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"
import { buildBookingInvoice } from "@/lib/booking-invoice-model"
import { renderBookingInvoiceHtml } from "@/lib/booking-invoice-html"
import { createBookingInvoicePdf } from "@/lib/booking-invoice-pdf"

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
  if (!bookingId) return jsonFailure("Booking ID is required.", 400)

  try {
    const snapshot = await db.collection("guestbooking").doc(bookingId).get()
    if (!snapshot.exists) return jsonFailure("Booking not found.", 404)
    const booking = snapshot.data()
    if (!canManageBooking(authResult.user, booking)) return jsonFailure("You cannot manage this booking.", 403)
    if (!booking.email) return jsonFailure("Booking has no guest email address.", 400)

    const mail = await resolveCentralEnvMail()
    if (!mail.ok) {
      console.error("Booking invoice email unavailable:", mail.code, mail.message)
      return jsonFailure("Invoice email is not configured.", 503)
    }

    const businessRef = booking.ownerUid
      ? db.doc(`resortOwners/${booking.ownerUid}/site/branding`)
      : db.doc("settings/branding")
    const businessSnapshot = await businessRef.get()
    const businessData = businessSnapshot.exists ? businessSnapshot.data() : {}
    const invoice = buildBookingInvoice(
      { ...booking, id: bookingId },
      {
        name: businessData.name,
        address: businessData.address,
        phone: businessData.phone,
        email: businessData.email,
      },
    )
    const pdf = createBookingInvoicePdf(invoice)
    await mail.transporter.sendMail({
      from: `"${mail.brandName}" <${mail.user}>`,
      to: booking.email,
      replyTo: mail.replyTo,
      subject: `Invoice ${invoice.invoiceId} — ${mail.brandName}`,
      text: `Your invoice ${invoice.invoiceId} for booking ${bookingId} is attached.`,
      html: `<p>Hello ${String(booking.name || "Guest").replace(/[<>&"]/g, "")},</p><p>Your booking invoice is attached.</p>`,
      attachments: [
        {
          filename: `${invoice.invoiceId}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
        {
          filename: `${invoice.invoiceId}.html`,
          content: renderBookingInvoiceHtml(invoice),
          contentType: "text/html",
        },
      ],
    })
    return Response.json({ success: true, invoiceId: invoice.invoiceId })
  } catch (error) {
    console.error("Failed to send booking invoice:", error)
    return jsonFailure("Failed to send booking invoice.", 502)
  }
}