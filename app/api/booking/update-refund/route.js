import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
  normalizeDate,
} from "@/lib/booking-api-server"
import { writeResortAdminEvent } from "@/lib/resort-admin-events.mjs"

const REFUND_STATUSES = new Set(["not_refunded", "pending", "refunded"])

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!hasBookingPermission(authResult.user, "refund")) {
    return jsonFailure("Your staff role cannot update refund records.", 403)
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
  const amount = Number(body?.refundAmount)
  const status = String(body?.refundStatus || "")
  const date = body?.refundDate ? normalizeDate(body.refundDate) : ""
  const reason = String(body?.refundReason || "").trim().slice(0, 500)
  if (
    !bookingId ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !REFUND_STATUSES.has(status) ||
    (body?.refundDate && !date) ||
    (status === "refunded" && !date)
  ) {
    return jsonFailure("Enter a valid refund amount, status, and date.", 400)
  }

  try {
    const bookingRef = db.collection("guestbooking").doc(bookingId)
    const bookingSnapshot = await bookingRef.get()
    if (!bookingSnapshot.exists) return jsonFailure("Booking not found.", 404)
    const booking = bookingSnapshot.data()
    if (!canManageBooking(authResult.user, booking)) {
      return jsonFailure("You cannot update this booking's refund.", 403)
    }
    if (booking.status !== "Cancelled") {
      return jsonFailure("Refunds can only be recorded for cancelled bookings.", 409)
    }
    if (
      amount > Number(booking.paymentAmount || 0) ||
      (amount > 0 && !reason)
    ) {
      return jsonFailure("Refund cannot exceed the recorded payment; add a reason and valid status.", 400)
    }

    const historyRef = db.collection("paymentHistory").doc()
    const now = new Date()
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(bookingRef)
      if (!current.exists || current.get("status") !== "Cancelled") {
        throw new Error("REFUND_STATUS_CHANGED")
      }
      if (amount > Number(current.get("paymentAmount") || 0)) throw new Error("REFUND_AMOUNT_CHANGED")
      transaction.update(bookingRef, {
        refundAmount: amount,
        refundStatus: amount > 0 ? status : "not_applicable",
        refundDate: date || "",
        refundReason: reason,
        refundRecordedAt: now,
        refundRecordedBy: authResult.user.uid,
        updatedAt: now,
      })
      if (amount > 0) {
        transaction.create(historyRef, {
          ownerUid: authResult.user.ownerUid,
          bookingId,
          guestName: String(current.get("name") || ""),
          roomType: String(current.get("roomType") || ""),
          checkIn: String(current.get("checkIn") || ""),
          checkOut: String(current.get("checkOut") || ""),
          action: "refund-recorded",
          paymentStatus: status,
          paymentMethod: String(current.get("paymentMethod") || ""),
          amount,
          refundDate: date || "",
          recordedBy: authResult.user.uid,
          recordedByEmail: authResult.user.email,
          createdAt: now,
        })
      }
      writeResortAdminEvent(transaction, db, {
        ownerUid: String(current.get("ownerUid") || authResult.user.ownerUid || authResult.user.uid),
        actorUid: authResult.user.uid,
        actorEmail: authResult.user.email,
        actorRole: authResult.user.staffRole,
        action: "refund.updated",
        entityType: "booking",
        entityId: bookingId,
        summary: "A booking refund record was updated.",
        before: {
          refundAmount: Number(current.get("refundAmount") || 0),
          refundStatus: String(current.get("refundStatus") || ""),
          refundDate: String(current.get("refundDate") || ""),
        },
        after: {
          refundAmount: amount,
          refundStatus: amount > 0 ? status : "not_applicable",
          refundDate: date || "",
        },
      })
    })
    return Response.json({ success: true, refundAmount: amount, refundStatus: amount ? status : "not_applicable" })
  } catch (error) {
    if (error.message === "REFUND_STATUS_CHANGED") {
      return jsonFailure("Booking status changed. Refresh and try again.", 409)
    }
    if (error.message === "REFUND_AMOUNT_CHANGED") {
      return jsonFailure("Refund exceeds the recorded payment.", 409)
    }
    console.error("Failed to update refund record:", error)
    return jsonFailure("Refund record could not be updated.", 500)
  }
}
