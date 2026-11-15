import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"
import {
  authenticateBookingAdmin,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

export async function PATCH(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (authResult.user.isOwner || authResult.user.isLegacyAdmin) {
    return jsonFailure("This action is only available to resort staff.", 403)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)
  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }

  const notificationId = String(body?.notificationId || "").trim()
  if (!notificationId || notificationId.includes("/") || notificationId.length > 150) {
    return jsonFailure("A valid notification is required.", 400)
  }

  const notificationRef = db
    .collection("resortOwners")
    .doc(authResult.user.ownerUid)
    .collection("staffNotifications")
    .doc(notificationId)
  try {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(notificationRef)
      if (!current.exists || current.get("staffUid") !== authResult.user.uid) {
        const error = new Error("Staff notification not found.")
        error.status = 404
        throw error
      }
      if (current.get("read") === true) return
      transaction.update(notificationRef, { read: true, readAt: new Date() })
      writeResortAdminAudit(transaction, db, {
        ownerUid: authResult.user.ownerUid,
        actorUid: authResult.user.uid,
        actorEmail: authResult.user.email,
        actorRole: authResult.user.staffRole,
        action: "staff-notification.mark-read",
        entityType: "staff-notification",
        entityId: notificationId,
        summary: "Staff member marked a notification as read.",
        after: { status: "read" },
      })
    })
    return Response.json({ success: true })
  } catch (error) {
    if (Number.isInteger(error?.status)) return jsonFailure(error.message, error.status)
    console.error("Failed to update staff notification:", error)
    return jsonFailure("Staff notification could not be updated.", 500)
  }
}
