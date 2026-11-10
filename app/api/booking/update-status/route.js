import { FieldValue } from "firebase-admin/firestore"
import {
  authenticateBookingAdmin,
  canManageBooking,
  canTransitionBookingStatus,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
  normalizeDate,
} from "@/lib/booking-api-server"

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
  if (!bookingId || !canTransitionBookingStatus(body?.currentStatus, status)) {
    return jsonFailure("Booking status transition is invalid.", 400)
  }
  if (!hasBookingPermission(authResult.user, "booking")) {
    return jsonFailure("Your staff role cannot update booking status.", 403)
  }
  const cancellationReason = String(body?.cancellationReason || "").trim().slice(0, 500)
  const refundAmount = Number(body?.refundAmount ?? 0)
  const refundStatus = String(body?.refundStatus || "not_applicable")
  const refundDate = body?.refundDate ? normalizeDate(body.refundDate) : ""
  if (
    status === "Cancelled" &&
    (!cancellationReason ||
      !Number.isFinite(refundAmount) ||
      refundAmount < 0 ||
      !["not_applicable", "not_refunded", "pending", "refunded"].includes(refundStatus) ||
      (body?.refundDate && !refundDate) ||
      (refundStatus === "refunded" && !refundDate))
  ) {
    return jsonFailure("Enter a cancellation reason and valid manual refund details.", 400)
  }

  try {
    const bookingRef = db.collection("guestbooking").doc(bookingId)
    const bookingSnapshot = await bookingRef.get()
    if (!bookingSnapshot.exists) return jsonFailure("Booking not found.", 404)
    const booking = bookingSnapshot.data()
    if (!canManageBooking(authResult.user, booking)) return jsonFailure("You cannot manage this booking.", 403)
    if (booking.status !== body.currentStatus) return jsonFailure("Booking status changed. Refresh and try again.", 409)
    if (
      status === "Cancelled" &&
      (refundAmount > Number(booking.paymentAmount || 0) ||
        (refundAmount > 0 && refundStatus === "not_applicable"))
    ) {
      return jsonFailure("Refund amount cannot exceed the recorded payment; choose a refund status.", 400)
    }

    const locksSnapshot = ["Declined", "Cancelled", "Completed"].includes(status)
      ? await db.collection("bookingDateLocks").where("bookingId", "==", bookingId).get()
      : null
    const lockRefs = locksSnapshot?.docs.map((lock) => lock.ref) || []
    const refundHistoryRef = status === "Cancelled" && refundAmount > 0
      ? db.collection("paymentHistory").doc()
      : null
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
        ...(status === "Cancelled"
          ? {
              cancellationReason,
              cancellationRecordedAt: new Date(),
              cancellationRecordedBy: authResult.user.uid,
              refundAmount,
              refundStatus: refundAmount > 0 ? refundStatus : "not_applicable",
              refundDate: refundDate || "",
              refundRecordedAt: new Date(),
              refundRecordedBy: authResult.user.uid,
            }
          : {}),
        ...(status === "Completed"
          ? {
              validIdImage: FieldValue.delete(),
              validIdUrl: FieldValue.delete(),
            }
          : {}),
        updatedAt: new Date(),
      })
      if (refundHistoryRef) {
        transaction.create(refundHistoryRef, {
          ownerUid: booking.ownerUid || authResult.user.ownerUid,
          bookingId,
          guestName: String(booking.name || ""),
          roomType: String(booking.roomType || ""),
          checkIn: String(booking.checkIn || ""),
          checkOut: String(booking.checkOut || ""),
          action: "refund-recorded",
          paymentStatus: refundStatus,
          paymentMethod: String(booking.paymentMethod || ""),
          amount: refundAmount,
          refundDate: refundDate || "",
          recordedBy: authResult.user.uid,
          recordedByEmail: authResult.user.email,
          createdAt: new Date(),
        })
      }
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