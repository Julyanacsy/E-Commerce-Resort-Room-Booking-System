import { FieldValue } from "firebase-admin/firestore"
import {
  authenticateBookingAdmin,
  canManageBooking,
  getManilaDate,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
} from "@/lib/booking-api-server"

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!hasBookingPermission(authResult.user, "booking")) {
    return jsonFailure("Your staff role cannot complete bookings.", 403)
  }
  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const { user } = authResult
    const snapshot = user.isLegacyAdmin
      ? await db.collection("guestbooking").where("status", "==", "Approved").limit(1000).get()
      : await db
          .collection("guestbooking")
          .where("ownerUid", "==", user.ownerUid)
          .limit(1000)
          .get()
    const today = getManilaDate()
    const completed = []
    for (const item of snapshot.docs) {
      const booking = item.data()
      if (
        !canManageBooking(user, booking) ||
        booking.status !== "Approved" ||
        !booking.checkOut ||
        booking.checkOut >= today
      ) continue
      const locks = await db.collection("bookingDateLocks").where("bookingId", "==", item.id).get()
      const lockRefs = locks.docs.map((lock) => lock.ref)
      const didComplete = await db.runTransaction(async (transaction) => {
        const [current] = await Promise.all([
          transaction.get(item.ref),
          ...lockRefs.map((ref) => transaction.get(ref)),
        ])
        if (!current.exists || current.get("status") !== "Approved" || current.get("checkOut") >= today) return false
        transaction.update(item.ref, {
          status: "Completed",
          validIdImage: FieldValue.delete(),
          validIdUrl: FieldValue.delete(),
          updatedAt: new Date(),
        })
        lockRefs.forEach((ref) => transaction.delete(ref))
        return true
      })
      if (didComplete) completed.push(item.id)
    }
    return Response.json({ success: true, completedCount: completed.length })
  } catch (error) {
    console.error("Failed to auto-complete bookings:", error)
    return jsonFailure("Failed to auto-complete bookings.", 500)
  }
}