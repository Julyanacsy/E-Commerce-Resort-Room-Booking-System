import {
  authenticateBookingAdmin,
  canManageBooking,
  getPaymentActionError,
  hasBookingPermission,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"
import {
  calculateReservationDeposit,
  getRecordedPaymentAmount,
} from "@/lib/payment-domain.mjs"
import { writeResortAdminEvent } from "@/lib/resort-admin-events.mjs"

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
  if (!bookingId || !["mark-as-paid", "reject", "record-cash"].includes(action)) {
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

    const paymentResult = await db.runTransaction(async (transaction) => {
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
      const total = Math.max(0, Number(current.get("totalPrice") || 0))
      const alreadyPaid = getRecordedPaymentAmount({
        paymentStatus: status,
        paymentAmount: current.get("paymentAmount"),
        totalPrice: total,
      })
      const depositTarget = Number(current.get("reservationDepositAmount"))
      const depositAmount = Number.isFinite(depositTarget) && depositTarget >= 0
        ? depositTarget
        : calculateReservationDeposit(total, current.get("reservationDepositPercent") || 100)
      const paymentMethod = action === "record-cash" ? "cash" : "gcash"
      const amountReceived = action === "reject"
        ? 0
        : Math.max(0, Math.min(total - alreadyPaid, depositAmount - alreadyPaid))
      if (action !== "reject" && amountReceived <= 0) throw new Error("PAYMENT_ALREADY_SETTLED")
      const updatedPaid = Math.round((alreadyPaid + amountReceived) * 100) / 100
      const nextPaymentStatus = action === "reject"
        ? "rejected"
        : updatedPaid >= total
          ? "paid"
          : "partially_paid"
      const previousMethod = String(current.get("paymentMethod") || "")
      const recordedMethod = previousMethod && previousMethod !== paymentMethod
        ? "mixed"
        : paymentMethod
      const now = new Date()
      transaction.update(bookingRef, {
        paymentStatus: nextPaymentStatus,
        ...(action === "reject" ? {} : {
          paymentMethod: recordedMethod,
          paymentAmount: updatedPaid,
          paidAt: now,
        }),
        paymentReviewedAt: now,
        paymentReviewedBy: authResult.user.uid,
        paymentReviewedByEmail: authResult.user.email,
        updatedAt: now,
      })
      transaction.create(historyRef, {
        ownerUid: authResult.user.ownerUid,
        bookingId,
        guestName: String(current.get("name") || ""),
        roomType: String(current.get("roomType") || ""),
        checkIn: String(current.get("checkIn") || ""),
        checkOut: String(current.get("checkOut") || ""),
        action: action === "reject"
          ? "payment-rejected"
          : action === "record-cash"
            ? "deposit-cash-recorded"
            : "deposit-gcash-verified",
        paymentStatus: nextPaymentStatus,
        paymentMethod,
        amount: amountReceived,
        recordedBy: authResult.user.uid,
        recordedByEmail: authResult.user.email,
        createdAt: new Date(),
      })
      writeResortAdminEvent(transaction, db, {
        ownerUid: authResult.user.ownerUid,
        actorUid: authResult.user.uid,
        actorEmail: authResult.user.email,
        actorRole: authResult.user.staffRole,
        action: action === "reject" ? "payment.rejected" : "payment.received",
        entityType: "booking",
        entityId: bookingId,
        summary: action === "reject"
          ? `Payment proof for booking ${bookingId} was rejected.`
          : `Reservation deposit of PHP ${amountReceived.toLocaleString("en-PH")} was received for booking ${bookingId}.`,
        before: { paymentStatus: status },
        after: {
          paymentStatus: nextPaymentStatus,
          paymentMethod: action === "record-cash" ? "cash" : "gcash",
          paymentAmount: updatedPaid,
        },
        emailRecipients: current.get("email") ? [String(current.get("email"))] : [],
        ...(action !== "reject"
          ? {
              notification: {
                type: "payment.received",
                title: "Reservation deposit received",
                message: `${action === "record-cash" ? "Cash" : "GCash"} deposit of PHP ${amountReceived.toLocaleString("en-PH")} received for booking ${bookingId}. Balance due at check-in: PHP ${Math.max(0, total - updatedPaid).toLocaleString("en-PH")}.`,
              },
            }
          : {}),
      })
      return { paymentStatus: nextPaymentStatus, paymentAmount: updatedPaid, amountReceived }
    })

    return Response.json({
      success: true,
      bookingId,
      ...paymentResult,
      paymentMethod: action === "record-cash" ? "cash" : "gcash",
    })
  } catch (error) {
    if (error.message === "PAYMENT_REVIEW_CHANGED") {
      return jsonFailure("Payment status changed. Refresh and try again.", 409)
    }
    if (error.message === "PAYMENT_ALREADY_SETTLED") {
      return jsonFailure("The reservation deposit is already paid.", 409)
    }
    console.error("Failed to update booking payment status:", error)
    return jsonFailure("Payment status could not be updated.", 500)
  }
}
