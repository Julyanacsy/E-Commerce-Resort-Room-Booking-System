/**
 * Super Admin audit trail — append-only entries for approve/reject (and future actions).
 * Collection: superAdminAuditLog
 */

import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore"

export const SUPER_ADMIN_AUDIT_COLLECTION = "superAdminAuditLog"

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {{
 *   action: string
 *   resortId: string
 *   resortName?: string
 *   ownerUid?: string
 *   previousStatus?: string
 *   newStatus: string
 *   reason?: string | null
 *   actorEmail: string
 *   actorUid: string
 * }} payload
 */
export async function appendSuperAdminAudit(db, payload) {
  if (!db) return
  const createdAt = serverTimestamp()
  const action = String(payload.action || "platform.update").slice(0, 60)
  const resortId = String(payload.resortId || "").slice(0, 128)
  const ownerUid = String(payload.ownerUid || "").slice(0, 128)
  const title = `Platform update: ${action.replaceAll("-", " ")}`.slice(0, 100)
  const message = `${String(payload.resortName || resortId || "Marketplace settings").slice(0, 180)} was updated.`
  const batch = writeBatch(db)
  batch.set(doc(collection(db, SUPER_ADMIN_AUDIT_COLLECTION)), {
    ...payload,
    reason: payload.reason != null ? String(payload.reason).slice(0, 2000) : null,
    createdAt,
  })
  batch.set(doc(collection(db, "superAdminNotifications")), {
    type: action,
    title,
    message,
    resortId,
    ownerUid,
    actorUid: String(payload.actorUid || "").slice(0, 128),
    read: false,
    createdAt,
  })
  const outboxRef = doc(collection(db, "resortNotificationOutbox"))
  batch.set(outboxRef, {
    ownerUid,
    eventId: outboxRef.id,
    action,
    entityType: "platform",
    entityId: resortId || ownerUid,
    audienceRoles: [],
    title,
    message,
    actorUid: String(payload.actorUid || "").slice(0, 128),
    platformAdminRecipient: true,
    status: "pending",
    attempts: 0,
    createdAt,
  })
  await batch.commit()
}
