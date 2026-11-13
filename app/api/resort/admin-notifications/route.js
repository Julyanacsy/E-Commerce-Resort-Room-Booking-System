import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"
import { FieldValue } from "firebase-admin/firestore"
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
  if (!authResult.user.ownerUid) return jsonFailure("Resort notifications are unavailable.", 403)

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const notificationsRef = db
      .collection("resortOwners")
      .doc(authResult.user.ownerUid)
      .collection("adminNotifications")
    const isOwner = authResult.user.isOwner
    const role = String(authResult.user.staffRole || "")
    const query = isOwner
      ? notificationsRef.orderBy("createdAt", "desc")
      : notificationsRef
        .where("audienceRoles", "array-contains", role)
        .orderBy("createdAt", "desc")
    const snapshot = await query.limit(MAX_NOTIFICATION_PAGE_SIZE).get()
    const notifications = snapshot.docs.map((item) => {
      const readBy = item.get("readBy") || []
      const read = isOwner ? item.get("read") === true : readBy.includes(authResult.user.uid)
      return {
        id: item.id,
        ...item.data(),
        read,
        createdAt: item.get("createdAt")?.toDate?.().toISOString() || null,
      }
    })
    return Response.json({
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load resort admin notifications:", error)
    return jsonFailure("Admin notifications could not be loaded.", 500)
  }
}

export async function PATCH(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!authResult.user.ownerUid) return jsonFailure("Resort notifications are unavailable.", 403)

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
    const isOwner = authResult.user.isOwner
    const role = String(authResult.user.staffRole || "")
    const updateReadState = (transaction, notificationRef) => {
      transaction.update(notificationRef, isOwner
        ? { read: true, readAt: new Date() }
        : { readBy: FieldValue.arrayUnion(authResult.user.uid) })
    }
    if (action === "mark-read") {
      await db.runTransaction(async (transaction) => {
        const notificationRef = notificationsRef.doc(notificationId)
        const snapshot = await transaction.get(notificationRef)
        if (!snapshot.exists || (!isOwner && !(
          Array.isArray(snapshot.get("audienceRoles"))
          && snapshot.get("audienceRoles").includes(authResult.user.staffRole)
        ))) {
          const error = new Error("Notification not found.")
          error.status = 404
          throw error
        }
        const alreadyRead = isOwner
          ? snapshot.get("read") === true
          : (snapshot.get("readBy") || []).includes(authResult.user.uid)
        if (!alreadyRead) {
          updateReadState(transaction, notificationRef)
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
      let cursor = null
      do {
        let candidatesQuery = isOwner
          ? notificationsRef.orderBy("createdAt", "desc")
          : notificationsRef
            .where("audienceRoles", "array-contains", role)
            .orderBy("createdAt", "desc")
        if (cursor) candidatesQuery = candidatesQuery.startAfter(cursor)
        const candidates = await candidatesQuery.limit(MARK_ALL_BATCH_SIZE).get()
        cursor = candidates.docs.at(-1) || null
        const unread = candidates.docs.filter((notification) => (
          isOwner
            ? notification.get("read") !== true
            : !(notification.get("readBy") || []).includes(authResult.user.uid)
        ))
        if (unread.length) {
          const batch = db.batch()
          unread.forEach((notification) => {
            updateReadState(batch, notification.ref)
          })
          await batch.commit()
          updatedCount += unread.length
        }
        if (candidates.size < MARK_ALL_BATCH_SIZE) cursor = null
      } while (cursor)
      if (updatedCount > 0) {
        await db.runTransaction(async (transaction) => {
          writeResortAdminAudit(transaction, db, {
            ...actor,
            action: "notification.mark-all-read",
            entityType: "admin-notification",
            entityId: "",
            summary: `Marked ${updatedCount} resort notifications as read.`,
            after: { status: "read" },
          })
        })
      }
    }
    return Response.json({ success: true, updatedCount })
  } catch (error) {
    if (Number.isInteger(error?.status)) return jsonFailure(error.message, error.status)
    console.error("Failed to update resort admin notifications:", error)
    return jsonFailure("Admin notifications could not be updated.", 500)
  }
}
