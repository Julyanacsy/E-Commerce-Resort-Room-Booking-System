import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { getBrandingMailContext, sanitizeMailDisplayName } from "@/lib/central-env-mail"
import { normalizeOwnerUid } from "@/lib/booking-tenant"

/**
 * Display name for outbound booking emails (OTP, status, verify flows).
 * Prefers tenant branding, then marketplace resort doc, then global settings/branding.
 */
export async function resolveEmailBrandName(ownerUid) {
  const uid = normalizeOwnerUid(ownerUid)
  if (uid && db) {
    try {
      const brandingSnap = await getDoc(doc(db, "resortOwners", uid, "site", "branding"))
      if (brandingSnap.exists()) {
        const n = brandingSnap.data()?.name
        if (typeof n === "string" && n.trim()) return sanitizeMailDisplayName(n.trim())
      }
    } catch (e) {
      console.warn("resolveEmailBrandName branding:", e?.message)
    }
    try {
      const resortSnap = await getDoc(doc(db, "resorts", uid))
      if (resortSnap.exists()) {
        const n = resortSnap.data()?.name
        if (typeof n === "string" && n.trim()) return sanitizeMailDisplayName(n.trim())
      }
    } catch (e) {
      console.warn("resolveEmailBrandName resorts:", e?.message)
    }
  }
  const { name } = await getBrandingMailContext()
  return name
}
