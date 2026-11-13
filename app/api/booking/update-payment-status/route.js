import {
  authenticateBookingAdmin,
  canManageBooking,
  getPaymentActionError,
  hasBookingPermission,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"
import { writeResortAdminEvent } from "@/lib/resort-admin-events.mjs"

const PAYMENT_STATUS_BY_ACTION = {
  "mark-as-paid": "paid",
  reject: "rejected",
  "record-cash": "paid",
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
  const action = String(body?.action || "").trim()
  const nextPaymentStatus = PAYMENT_STATUS_BY_ACTION[action]
  if (!bookingId || !nextPaymentStatus) {
    return jsonFailure("Booking and a valid payment action are required.", 400)
  }
  const permission = action === "record-cash" ? "booking" : "payment"
  if (!hasBookingPermission(authResult.user, permission)) {
    return jsonFailure("Your staff role cannot update this payment.", 403)
  }

  try {
    const bookingRef = db.collection("guestbooking").doc(bookingId)
    const historyRef = db.collection("paymentHistory").doc()
    const bookingSnapshot = await bookingRef.get()
    if (!bookingSnapshot.exists) return jsonFailure("Booking not found.", 404)
    const booking = bookingSnapshot.data()
    if (
      !canManageBooking(authResult.user, booking) ||
      booking.ownerUid !== authResult.user.ownerUid
    ) {
      return jsonFailure("You cannot update payment for this booking.", 403)
    }
    const currentPaymentStatus = String(booking.paymentStatus || "unpaid")
    const paymentActionError = getPaymentActionError(
      action,
      currentPaymentStatus,
      booking.status,
      Boolean(booking.proofOfPaymentImage || booking.proofOfPaymentUrl),
      Boolean(booking.validIdImage || booking.validIdUrl),
    )
    if (paymentActionError) return jsonFailure(paymentActionError, 409)

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(bookingRef)
      if (!current.exists) throw new Error("PAYMENT_REVIEW_CHANGED")
      const status = String(current.get("paymentStatus") || "unpaid")
      const currentBookingStatus = current.get("status")
      if (
        current.get("ownerUid") !== authResult.user.ownerUid ||
        getPaymentActionError(
          action,
          status,
          currentBookingStatus,
          Boolean(current.get("proofOfPaymentImage") || current.get("proofOfPaymentUrl")),
          Boolean(current.get("validIdImage") || current.get("validIdUrl")),
        )
      ) {
        throw new Error("PAYMENT_REVIEW_CHANGED")
      }
      transaction.update(bookingRef, {
        paymentStatus: nextPaymentStatus,
        paymentMethod: action === "record-cash" ? "cash" : "gcash",
        paymentAmount: Number(current.get("totalPrice") || 0),
        paymentReviewedAt: new Date(),
        paymentReviewedBy: authResult.user.uid,
        paymentReviewedByEmail: authResult.user.email,
        updatedAt: new Date(),
      })
      transaction.create(historyRef, {
        ownerUid: authResult.user.ownerUid,
        bookingId,
        guestName: String(current.get("name") || ""),
        roomType: String(current.get("roomType") || ""),
        checkIn: String(current.get("checkIn") || ""),
        checkOut: String(current.get("checkOut") || ""),
        action: action === "record-cash" ? "cash-recorded" : action,
        paymentStatus: nextPaymentStatus,
        paymentMethod: action === "record-cash" ? "cash" : "gcash",
        amount: Number(current.get("totalPrice") || 0),
        recordedBy: authResult.user.uid,
        recordedByEmail: authResult.user.email,
        createdAt: new Date(),
      })
      writeResortAdminEvent(transaction, db, {
        ownerUid: authResult.user.ownerUid,
        actorUid: authResult.user.uid,
        actorEmail: authResult.user.email,
        actorRole: authResult.user.staffRole,
        action: nextPaymentStatus === "paid" ? "payment.received" : "payment.rejected",
        entityType: "booking",
        entityId: bookingId,
        summary: nextPaymentStatus === "paid"
          ? "A booking payment was recorded as received."
          : "A booking payment submission was rejected.",
        before: { paymentStatus: status },
        after: {
          paymentStatus: nextPaymentStatus,
          paymentMethod: action === "record-cash" ? "cash" : "gcash",
          paymentAmount: Number(current.get("totalPrice") || 0),
        },
        ...(nextPaymentStatus === "paid"
          ? {
              notification: {
                type: "payment.received",
                title: "Payment received",
                message: `A ${action === "record-cash" ? "cash" : "GCash"} payment for booking ${bookingId} was recorded as received.`,
              },
            }
          : {}),
      })
    })

    return Response.json({
      success: true,
      bookingId,
      paymentStatus: nextPaymentStatus,
      paymentMethod: action === "record-cash" ? "cash" : "gcash",
    })
  } catch (error) {
    if (error.message === "PAYMENT_REVIEW_CHANGED") {
      return jsonFailure("Payment status changed. Refresh and try again.", 409)
    }
    console.error("Failed to update booking payment status:", error)
    return jsonFailure("Payment status could not be updated.", 500)
  }
}
