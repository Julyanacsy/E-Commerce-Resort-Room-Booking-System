import { FieldValue } from "firebase-admin/firestore"
import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

const NEXT_STATUS = {
  Pending: new Set(["Approved", "Declined"]),
  Approved: new Set(["Cancelled", "Completed"]),
}

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
  const status = String(body?.status || "").trim()
  if (!bookingId || !NEXT_STATUS[body?.currentStatus]?.has(status)) {
    return jsonFailure("Booking status transition is invalid.", 400)
  }

  try {
    const bookingRef = db.collection("guestbooking").doc(bookingId)
    const bookingSnapshot = await bookingRef.get()
    if (!bookingSnapshot.exists) return jsonFailure("Booking not found.", 404)
    const booking = bookingSnapshot.data()
    if (!canManageBooking(authResult.user, booking)) return jsonFailure("You cannot manage this booking.", 403)
    if (booking.status !== body.currentStatus) return jsonFailure("Booking status changed. Refresh and try again.", 409)

    const locksSnapshot = ["Declined", "Cancelled", "Completed"].includes(status)
      ? await db.collection("bookingDateLocks").where("bookingId", "==", bookingId).get()
      : null
    const lockRefs = locksSnapshot?.docs.map((lock) => lock.ref) || []
    await db.runTransaction(async (transaction) => {
      const [current] = await Promise.all([
        transaction.get(bookingRef),
        ...lockRefs.map((ref) => transaction.get(ref)),
      ])
      if (!current.exists || current.get("status") !== body.currentStatus) {
        throw new Error("BOOKING_STATUS_CHANGED")
      }
      transaction.update(bookingRef, {
        status,
        ...(status === "Completed"
          ? {
              validIdImage: FieldValue.delete(),
              validIdUrl: FieldValue.delete(),
            }
          : {}),
        updatedAt: new Date(),
      })
      if (lockRefs.length) lockRefs.forEach((ref) => transaction.delete(ref))
    })

    return Response.json({ success: true, bookingId, status })
  } catch (error) {
    if (error.message === "BOOKING_STATUS_CHANGED") {
      return jsonFailure("Booking status changed. Refresh and try again.", 409)
    }
    console.error("Failed to update booking status:", error)
    return jsonFailure("Failed to update booking status.", 500)
  }
}