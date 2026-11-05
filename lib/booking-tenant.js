/**
 * Normalize resort owner id from API / client (string or missing).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeOwnerUid(value) {
  if (value == null) return null
  const s = String(value).trim()
  return s.length ? s : null
}

/**
 * Value from `?o=` (or `/stay/[uid]`). Decode URI; strip `/` (invalid for Firebase Auth UIDs and breaks Firestore paths).
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeOwnerUidFromSearchParam(raw) {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep */
  }
  s = s.trim()
  if (!s) return null
  if (s.includes("/")) {
    s = s.replace(/\//g, "")
  }
  return s.length ? s : null
}

/**
 * OTP is stored per email; when multi-tenant, scope by owner so the same inbox can book different resorts.
 * @param {string} email normalized lowercase email
 * @param {string | null} ownerUid
 * @returns {string}
 */
export function otpStorageKey(email, ownerUid) {
  const o = normalizeOwnerUid(ownerUid)
  return o ? `${email}::${o}` : email
}

const SETTINGS_COLLECTION = "settings"
const MARKETPLACE_DOC_ID = "marketplace"

/**
 * UID for legacy rooms that omit `ownerUid` (Firestore `settings/marketplace`, then env).
 * @param {unknown} db Firestore from `@/lib/firebase`
 * @returns {Promise<string | null>}
 */
export async function getLegacyUnscopedRoomsOwnerUidFromDb(db) {
  const env =
    typeof process !== "undefined"
      ? String(process.env.NEXT_PUBLIC_LEGACY_UNSCOPED_ROOMS_OWNER_UID || "").trim()
      : ""
  try {
    const { doc, getDoc } = await import("firebase/firestore")
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, MARKETPLACE_DOC_ID))
    if (snap.exists()) {
      const v = snap.data()?.legacyUnscopedRoomsOwnerUid
      if (typeof v === "string" && v.trim()) return v.trim()
    }
  } catch {
    /* ignore */
  }
  return env.length ? env : null
}

/**
 * @param {Record<string, unknown>} data room document
 * @param {string | null} tenantOwnerUid
 * @param {string | null} [legacyUnscopedUid] when tenant matches, rooms with no ownerUid belong here
 */
export function roomBelongsToTenant(data, tenantOwnerUid, legacyUnscopedUid = null) {
  const ou = normalizeOwnerUid(tenantOwnerUid)
  if (!ou) {
    return !normalizeOwnerUid(data?.ownerUid)
  }
  const legacy = legacyUnscopedUid && String(legacyUnscopedUid).trim() === ou
  if (legacy) {
    const r = data?.ownerUid
    if (r == null || String(r).trim() === "") return true
    return r === ou
  }
  return data?.ownerUid === ou
}

/**
 * @param {Record<string, unknown>} data booking document
 * @param {string | null} tenantOwnerUid
 * @param {string | null} [legacyUnscopedUid]
 */
export function bookingBelongsToTenant(data, tenantOwnerUid, legacyUnscopedUid = null) {
  const ou = normalizeOwnerUid(tenantOwnerUid)
  if (!ou) {
    return !data?.ownerUid
  }
  const legacy = legacyUnscopedUid && String(legacyUnscopedUid).trim() === ou
  if (legacy) {
    return !data?.ownerUid || data.ownerUid === ou
  }
  return data?.ownerUid === ou
}
