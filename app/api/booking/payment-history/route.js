import {
  authenticateBookingAdmin,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (authResult.user.isLegacyAdmin) {
    return jsonFailure("Payment history is available to resort owners only.", 403)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const snapshot = await db
      .collection("paymentHistory")
      .where("ownerUid", "==", authResult.user.uid)
      .get()
    const events = snapshot.docs
      .map((item) => {
        const event = item.data()
        return {
          id: item.id,
          bookingId: String(event.bookingId || ""),
          guestName: String(event.guestName || ""),
          roomType: String(event.roomType || ""),
          checkIn: String(event.checkIn || ""),
          checkOut: String(event.checkOut || ""),
          action: String(event.action || ""),
          paymentStatus: String(event.paymentStatus || ""),
          paymentMethod: String(event.paymentMethod || ""),
          amount: Number(event.amount || 0),
          recordedBy: String(event.recordedBy || ""),
          createdAt: event.createdAt?.toDate?.().toISOString() || null,
        }
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 500)

    return Response.json({ events })
  } catch (error) {
    console.error("Failed to load payment history:", error)
    return jsonFailure("Payment history could not be loaded.", 500)
  }
}
