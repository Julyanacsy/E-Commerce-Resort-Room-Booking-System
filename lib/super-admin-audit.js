/**
 * Super Admin audit trail — append-only entries for approve/reject (and future actions).
 * Collection: superAdminAuditLog
 */

import { addDoc, collection, serverTimestamp } from "firebase/firestore"

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
  await addDoc(collection(db, SUPER_ADMIN_AUDIT_COLLECTION), {
    ...payload,
    reason: payload.reason != null ? String(payload.reason).slice(0, 2000) : null,
    createdAt: serverTimestamp(),
  })
}
