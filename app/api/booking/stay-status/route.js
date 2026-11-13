import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
} from "@/lib/booking-api-server"
import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!hasBookingPermission(authResult.user, "stay")) {
    return jsonFailure("Your staff role cannot update check-in or check-out.", 403)
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
  const action = String(body?.action || "").trim()
  if (!bookingId || !["check-in", "check-out"].includes(action)) {
    return jsonFailure("Booking and stay action are required.", 400)
  }

  try {
    const bookingRef = db.collection("guestbooking").doc(bookingId)
    const snapshot = await bookingRef.get()
    if (!snapshot.exists) return jsonFailure("Booking not found.", 404)
    if (!canManageBooking(authResult.user, snapshot.data())) {
      return jsonFailure("You cannot update this booking's stay status.", 403)
    }

    const now = new Date()
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(bookingRef)
      const stayStatus = String(current.get("stayStatus") || "not_checked_in")
      if (!current.exists || current.get("status") !== "Approved") throw new Error("STAY_NOT_ACTIVE")
      if (
        (action === "check-in" && stayStatus !== "not_checked_in") ||
        (action === "check-out" && stayStatus !== "checked_in")
      ) {
        throw new Error("STAY_STATUS_CHANGED")
      }
      transaction.update(bookingRef, {
        stayStatus: action === "check-in" ? "checked_in" : "checked_out",
        ...(action === "check-in"
          ? { checkedInAt: now, checkedInBy: authResult.user.uid }
          : { checkedOutAt: now, checkedOutBy: authResult.user.uid }),
        updatedAt: now,
      })
      writeResortAdminAudit(transaction, db, {
        ownerUid: String(current.get("ownerUid") || authResult.user.ownerUid || authResult.user.uid),
        actorUid: authResult.user.uid,
        actorEmail: authResult.user.email,
        actorRole: authResult.user.staffRole,
        action: `booking.${action}`,
        entityType: "booking",
        entityId: bookingId,
        summary: `Booking stay status changed to ${action === "check-in" ? "checked in" : "checked out"}.`,
        before: { stayStatus },
        after: { stayStatus: action === "check-in" ? "checked_in" : "checked_out" },
      })
    })
    return Response.json({
      success: true,
      bookingId,
      stayStatus: action === "check-in" ? "checked_in" : "checked_out",
      timestamp: now.toISOString(),
    })
  } catch (error) {
    if (error.message === "STAY_NOT_ACTIVE") {
      return jsonFailure("Only approved bookings can be checked in or out.", 409)
    }
    if (error.message === "STAY_STATUS_CHANGED") {
      return jsonFailure("Stay status changed. Refresh and try again.", 409)
    }
    console.error("Failed to update check-in/check-out status:", error)
    return jsonFailure("Stay status could not be updated.", 500)
  }
}
