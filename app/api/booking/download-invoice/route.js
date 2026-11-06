import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"
import { buildBookingInvoice } from "@/lib/booking-invoice-model"
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
    if (!canManageBooking(authResult.user, booking)) {
      return jsonFailure("You cannot access this booking invoice.", 403)
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

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceId}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("Failed to download booking invoice:", error)
    return jsonFailure("Booking invoice could not be generated.", 500)
  }
}
