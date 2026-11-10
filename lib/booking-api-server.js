import crypto from "node:crypto"
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin"
import { normalizeOwnerUid, roomBelongsToTenant } from "@/lib/booking-tenant"

import {
  bookingBelongsToTenant,
  canManageBooking,
  canTransitionBookingStatus,
  datesBetween,
  getPaymentActionError,
  getBookingDateLockId,
  hasActiveBookingConflict,
  hasBookingPermission,
  isActiveBooking,
  normalizeDate,
  overlaps,
} from "@/lib/booking-domain.mjs"

export {
  bookingBelongsToTenant,
  canManageBooking,
  canTransitionBookingStatus,
  datesBetween,
  getPaymentActionError,
  getBookingDateLockId,
  hasActiveBookingConflict,
  hasBookingPermission,
  isActiveBooking,
  normalizeDate,
  normalizeOwnerUid,
  overlaps,
}

export const LEGACY_BOOKING_ADMIN_EMAILS = new Set([
  "admin@luxestay.com",
  "resort.helpdesk01@gmail.com",
])
export const BOOKING_STATUSES = new Set(["Pending", "Approved", "Declined", "Cancelled", "Completed"])

export function getBookingDb() {
  return getAdminFirestore()
}

export async function authenticateBookingAdmin(request) {
  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return { error: "Authentication required.", status: 401 }

  const auth = getAdminAuth()
  if (!auth) return { error: "Firebase Admin credentials are not configured.", status: 503 }
  let decoded
  try {
    decoded = await auth.verifyIdToken(match[1])
  } catch (error) {
    console.error("Booking admin token verification failed:", error)
    return { error: "Authentication token is invalid or expired.", status: 401 }
  }

  const email = String(decoded.email || "").trim().toLowerCase()
  const uid = String(decoded.uid || "")
  const isLegacyAdmin =
    decoded.email_verified === true && LEGACY_BOOKING_ADMIN_EMAILS.has(email)
  if (isLegacyAdmin) {
    return {
      user: {
        uid,
        email,
        emailVerified: true,
        isLegacyAdmin: true,
        isOwner: false,
        ownerUid: null,
        staffRole: "admin",
      },
    }
  }

  const db = getAdminFirestore()
  if (!db) return { error: "Firebase Admin credentials are not configured.", status: 503 }
  try {
    const ownerSnapshot = await db.collection("resortOwners").doc(uid).get()
    if (ownerSnapshot.exists) {
      if (String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved") {
        return { error: "This resort owner account is not approved.", status: 403 }
      }
      return {
        user: {
          uid,
          email,
          emailVerified: decoded.email_verified === true,
          isLegacyAdmin: false,
          isOwner: true,
          ownerUid: uid,
          staffRole: "owner",
        },
      }
    }
  } catch (error) {
    console.error("Failed to resolve resort owner access:", error)
    return { error: "Unable to verify resort access.", status: 503 }
  }

  if (!email || decoded.email_verified !== true) {
    return { error: "A verified resort owner or invited staff account is required.", status: 403 }
  }
  try {
    const invitations = await db
      .collectionGroup("staffInvitations")
      .where("email", "==", email)
      .get()
    const activeInvitations = invitations.docs.filter((item) => item.get("active") === true)
    if (activeInvitations.length !== 1) {
      return { error: "This account does not have a unique active resort staff invitation.", status: 403 }
    }
    const invitation = activeInvitations[0].data()
    const ownerUid = String(invitation.ownerUid || "")
    const staffRole = String(invitation.role || "")
    if (!ownerUid || !["admin", "front-desk", "finance"].includes(staffRole)) {
      return { error: "The staff invitation is invalid.", status: 403 }
    }
    const ownerSnapshot = await db.collection("resortOwners").doc(ownerUid).get()
    if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved") {
      return { error: "This resort is not approved for staff access.", status: 403 }
    }
    return {
      user: {
        uid,
        email,
        emailVerified: decoded.email_verified === true,
        isLegacyAdmin: false,
        isOwner: false,
        ownerUid,
        staffRole,
      },
    }
  } catch (error) {
    console.error("Failed to resolve resort staff access:", error)
    return { error: "Unable to verify resort staff access.", status: 503 }
  }
}

export function jsonFailure(message, status = 500) {
  return Response.json({ error: message }, { status })
}

export function getManilaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const part = (type) => parts.find((item) => item.type === type)?.value || ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function getRoomKey(ownerUid, roomType) {
  return crypto
    .createHash("sha256")
    .update(`${normalizeOwnerUid(ownerUid) || "legacy"}\n${String(roomType).trim().toLowerCase()}`)
    .digest("hex")
}

export async function getLegacyRoomOwnerUid(db) {
  const env = String(process.env.NEXT_PUBLIC_LEGACY_UNSCOPED_ROOMS_OWNER_UID || "").trim()
  try {
    const snapshot = await db.doc("settings/marketplace").get()
    const configured = String(snapshot.data()?.legacyUnscopedRoomsOwnerUid || "").trim()
    return configured || env || null
  } catch (error) {
    console.error("Failed to load legacy booking owner setting:", error)
    return env || null
  }
}

export async function findRoomForTenant(db, roomType, ownerUid) {
  const name = String(roomType || "").trim()
  if (!name) return null
  const snapshot = await db.collection("rooms").where("name", "==", name).limit(100).get()
  const legacyUid = await getLegacyRoomOwnerUid(db)
  const room = snapshot.docs.find((item) =>
    roomBelongsToTenant(item.data(), ownerUid, legacyUid),
  )
  return room ? { id: room.id, ...room.data() } : null
}

export async function getBookedDates(db, roomType, ownerUid) {
  const roomKey = getRoomKey(ownerUid, roomType)
  const [bookingsSnapshot, locksSnapshot, legacyUid] = await Promise.all([
    db.collection("guestbooking").where("roomType", "==", roomType).get(),
    db.collection("bookingDateLocks").where("roomKey", "==", roomKey).get(),
    getLegacyRoomOwnerUid(db),
  ])
  const dates = new Set()
  for (const snapshot of bookingsSnapshot.docs) {
    const booking = snapshot.data()
    if (
      bookingBelongsToTenant(booking, ownerUid, legacyUid) &&
      isActiveBooking(booking) &&
      normalizeDate(booking.checkIn) &&
      normalizeDate(booking.checkOut)
    ) {
      for (const date of datesBetween(booking.checkIn, booking.checkOut) || []) dates.add(date)
    }
  }
  for (const lock of locksSnapshot.docs) {
    const date = normalizeDate(lock.get("date"))
    if (date) dates.add(date)
  }
  return [...dates].sort()
}

export async function verifyRecaptchaToken(token) {
  const secret = String(process.env.RECAPTCHA_SECRET_KEY || "").trim()
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "reCAPTCHA is not configured on the server.", status: 503 }
    }
    return { ok: true, skipped: true }
  }
  if (typeof token !== "string" || !token.trim()) {
    return { ok: false, error: "Complete the reCAPTCHA challenge.", status: 400 }
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
    cache: "no-store",
  })
  if (!response.ok) {
    console.error("reCAPTCHA verification service returned:", response.status)
    return { ok: false, error: "reCAPTCHA verification is unavailable.", status: 502 }
  }
  const result = await response.json()
  return result.success
    ? { ok: true }
    : { ok: false, error: "reCAPTCHA verification failed.", status: 400 }
}