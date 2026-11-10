import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
} from "@/lib/booking-api-server"
import { buildBookingReceipt } from "@/lib/booking-invoice-model"
import { createBookingInvoicePdf } from "@/lib/booking-invoice-pdf"

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (
    !hasBookingPermission(authResult.user, "payment") &&
    !hasBookingPermission(authResult.user, "booking")
  ) {
    return jsonFailure("Your staff role cannot download payment receipts.", 403)
  }

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
      return jsonFailure("You cannot access this booking receipt.", 403)
    }
    if (booking.paymentStatus !== "paid") {
      return jsonFailure("A receipt is available only after payment is recorded.", 409)
    }

    const businessRef = db.doc(`resortOwners/${authResult.user.ownerUid}/site/branding`)
    const businessSnapshot = await businessRef.get()
    const business = businessSnapshot.exists ? businessSnapshot.data() : {}
    const receipt = buildBookingReceipt({ ...booking, id: bookingId }, business)
    const pdf = createBookingInvoicePdf(receipt)

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receipt.invoiceId}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("Failed to download payment receipt:", error)
    return jsonFailure("Payment receipt could not be generated.", 500)
  }
}
