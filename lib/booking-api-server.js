import crypto from "node:crypto"
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin"
import { normalizeOwnerUid, roomBelongsToTenant } from "@/lib/booking-tenant"

export { normalizeOwnerUid }

export const LEGACY_BOOKING_ADMIN_EMAILS = new Set([
  "admin@luxestay.com",
  "resort.helpdesk01@gmail.com",
])
export const ACTIVE_BOOKING_STATUSES = new Set(["Pending", "Approved"])
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
  try {
    const decoded = await auth.verifyIdToken(match[1])
    return {
      user: {
        uid: decoded.uid,
        email: String(decoded.email || "").toLowerCase(),
        emailVerified: decoded.email_verified === true,
        isLegacyAdmin:
          decoded.email_verified === true &&
          LEGACY_BOOKING_ADMIN_EMAILS.has(String(decoded.email || "").toLowerCase()),
      },
    }
  } catch (error) {
    console.error("Booking admin token verification failed:", error)
    return { error: "Authentication token is invalid or expired.", status: 401 }
  }
}

export function canManageBooking(user, booking) {
  const bookingOwner = normalizeOwnerUid(booking?.ownerUid)
  return user.isLegacyAdmin
    ? !bookingOwner || bookingOwner === user.uid
    : bookingOwner === user.uid
}

export function jsonFailure(message, status = 500) {
  return Response.json({ error: message }, { status })
}

export function normalizeDate(value) {
  const date = String(value || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date
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

export function datesBetween(checkIn, checkOut) {
  const start = new Date(`${checkIn}T00:00:00.000Z`)
  const end = new Date(`${checkOut}T00:00:00.000Z`)
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  if (nights < 1 || nights > 60) return null
  return Array.from({ length: nights }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000)
    return date.toISOString().slice(0, 10)
  })
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

export function bookingBelongsToTenant(booking, ownerUid, legacyUid) {
  const bookingOwner = normalizeOwnerUid(booking?.ownerUid)
  if (!ownerUid) return !bookingOwner
  if (legacyUid && legacyUid === ownerUid) return !bookingOwner || bookingOwner === ownerUid
  return bookingOwner === ownerUid
}

export function isActiveBooking(booking) {
  return ACTIVE_BOOKING_STATUSES.has(String(booking?.status || "Pending"))
}

export function overlaps(checkIn, checkOut, otherCheckIn, otherCheckOut) {
  return String(otherCheckIn || "") < checkOut && String(otherCheckOut || "") > checkIn
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