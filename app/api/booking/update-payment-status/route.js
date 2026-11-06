import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

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

  try {
    const bookingRef = db.collection("guestbooking").doc(bookingId)
    const historyRef = db.collection("paymentHistory").doc()
    const bookingSnapshot = await bookingRef.get()
    if (!bookingSnapshot.exists) return jsonFailure("Booking not found.", 404)
    const booking = bookingSnapshot.data()
    if (
      !canManageBooking(authResult.user, booking) ||
      booking.ownerUid !== authResult.user.uid
    ) {
      return jsonFailure("Only this resort owner can verify payment.", 403)
    }
    if (!["Pending", "Approved"].includes(booking.status)) {
      return jsonFailure("Payment cannot be reviewed for a closed booking.", 409)
    }
    const currentPaymentStatus = String(booking.paymentStatus || "unpaid")
    if (action === "record-cash") {
      if (currentPaymentStatus === "paid") {
        return jsonFailure("This booking is already marked as paid.", 409)
      }
    } else {
      if (!["proof_submitted", "submitted_for_review"].includes(currentPaymentStatus)) {
        return jsonFailure("This booking has no pending payment proof to review.", 409)
      }
      if (!booking.proofOfPaymentImage && !booking.proofOfPaymentUrl) {
        return jsonFailure("Payment proof is missing.", 409)
      }
      if (action === "mark-as-paid" && !booking.validIdImage && !booking.validIdUrl) {
        return jsonFailure("Guest ID is missing.", 409)
      }
    }

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(bookingRef)
      if (!current.exists) throw new Error("PAYMENT_REVIEW_CHANGED")
      const status = String(current.get("paymentStatus") || "unpaid")
      const currentBookingStatus = current.get("status")
      if (
        !["Pending", "Approved"].includes(currentBookingStatus) ||
        current.get("ownerUid") !== authResult.user.uid ||
        (action === "record-cash"
          ? status === "paid"
          : !["proof_submitted", "submitted_for_review"].includes(status) ||
            (action === "mark-as-paid" && !current.get("validIdImage") && !current.get("validIdUrl")))
      ) {
        throw new Error("PAYMENT_REVIEW_CHANGED")
      }
      transaction.update(bookingRef, {
        paymentStatus: nextPaymentStatus,
        paymentMethod: action === "record-cash" ? "cash" : "gcash",
        paymentAmount: Number(current.get("totalPrice") || 0),
        paymentReviewedAt: new Date(),
        paymentReviewedBy: authResult.user.uid,
        updatedAt: new Date(),
      })
      transaction.create(historyRef, {
        ownerUid: authResult.user.uid,
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
        createdAt: new Date(),
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
