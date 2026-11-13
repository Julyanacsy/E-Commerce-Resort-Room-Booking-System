import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"
import {
  authenticateBookingAdmin,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

const MAX_NOTIFICATION_PAGE_SIZE = 30
const MARK_ALL_BATCH_SIZE = 400

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!authResult.user.isOwner) return jsonFailure("Only the resort admin can view these notifications.", 403)

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const notificationsRef = db
      .collection("resortOwners")
      .doc(authResult.user.ownerUid)
      .collection("adminNotifications")
    const [snapshot, unreadSnapshot] = await Promise.all([
      notificationsRef.orderBy("read", "asc").orderBy("createdAt", "desc").limit(MAX_NOTIFICATION_PAGE_SIZE).get(),
      notificationsRef.where("read", "==", false).count().get(),
    ])
    const notifications = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
      createdAt: item.get("createdAt")?.toDate?.().toISOString() || null,
    }))
    return Response.json({
      notifications,
      unreadCount: unreadSnapshot.data().count,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load resort admin notifications:", error)
    return jsonFailure("Admin notifications could not be loaded.", 500)
  }
}

export async function PATCH(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!authResult.user.isOwner) return jsonFailure("Only the resort admin can update these notifications.", 403)

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }

  const action = String(body?.action || "")
  const notificationId = String(body?.notificationId || "").trim()
  if (
    !["mark-read", "mark-all-read"].includes(action)
    || (action === "mark-read" && (!notificationId || notificationId.includes("/") || notificationId.length > 150))
  ) {
    return jsonFailure("A valid notification action is required.", 400)
  }

  const ownerUid = authResult.user.ownerUid
  const notificationsRef = db
    .collection("resortOwners")
    .doc(ownerUid)
    .collection("adminNotifications")
  const actor = {
    ownerUid,
    actorUid: authResult.user.uid,
    actorEmail: authResult.user.email,
    actorRole: authResult.user.staffRole,
  }

  try {
    let updatedCount = 0
    if (action === "mark-read") {
      await db.runTransaction(async (transaction) => {
        const notificationRef = notificationsRef.doc(notificationId)
        const snapshot = await transaction.get(notificationRef)
        if (!snapshot.exists) {
          const error = new Error("Notification not found.")
          error.status = 404
          throw error
        }
        if (snapshot.get("read") !== true) {
          transaction.update(notificationRef, { read: true, readAt: new Date() })
          writeResortAdminAudit(transaction, db, {
            ...actor,
            action: "notification.mark-read",
            entityType: "admin-notification",
            entityId: notificationId,
            summary: "Marked an admin notification as read.",
            after: { status: "read" },
          })
          updatedCount = 1
        }
      })
    } else {
      let batchCount
      do {
        batchCount = await db.runTransaction(async (transaction) => {
          const unread = await transaction.get(
            notificationsRef.where("read", "==", false).limit(MARK_ALL_BATCH_SIZE),
          )
          for (const notification of unread.docs) {
            transaction.update(notification.ref, { read: true, readAt: new Date() })
          }
          if (unread.size > 0) {
            writeResortAdminAudit(transaction, db, {
              ...actor,
              action: "notification.mark-all-read",
              entityType: "admin-notification",
              entityId: "",
              summary: `Marked ${unread.size} admin notifications as read.`,
              after: { status: "read" },
            })
          }
          return unread.size
        })
        updatedCount += batchCount
      } while (batchCount === MARK_ALL_BATCH_SIZE)
    }
    return Response.json({ success: true, updatedCount })
  } catch (error) {
    if (Number.isInteger(error?.status)) return jsonFailure(error.message, error.status)
    console.error("Failed to update resort admin notifications:", error)
    return jsonFailure("Admin notifications could not be updated.", 500)
  }
}
