import { createHash, randomBytes } from "node:crypto"

export const FEEDBACK_TOKEN_TTL_DAYS = 90
const FEEDBACK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function createBookingFeedbackToken() {
  return randomBytes(32).toString("base64url")
}

export function isValidBookingFeedbackToken(token) {
  return typeof token === "string" && FEEDBACK_TOKEN_PATTERN.test(token)
}

export function hashBookingFeedbackToken(token) {
  if (!isValidBookingFeedbackToken(token)) return ""
  return createHash("sha256").update(token).digest("hex")
}

export function isFeedbackInviteActive(invite, booking, now = new Date()) {
  const expiresAt = invite?.expiresAt?.toDate?.() || invite?.expiresAt
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  return Boolean(
    invite
    && booking
    && invite.bookingId === booking.id
    && invite.ownerUid === booking.ownerUid
    && !invite.usedAt
    && !invite.revokedAt
    && !booking.feedbackSubmittedAt
    && ["Approved", "Completed"].includes(String(booking.status || ""))
    && booking.stayStatus === "checked_out"
    && !Number.isNaN(expiry.getTime())
    && expiry.getTime() > now.getTime(),
  )
}

export function validateGuestFeedback({ rating, message }) {
  const normalizedRating = Number(rating)
  return Number.isInteger(normalizedRating)
    && normalizedRating >= 1
    && normalizedRating <= 5
    && typeof message === "string"
    && message.trim().length > 0
    && message.trim().length <= 5000
}

export function canAccessGuestWifi(booking, owner, ownerUid, email, today) {
  return Boolean(
    booking
    && owner
    && String(owner.status || "").toLowerCase() === "approved"
    && String(booking.ownerUid || "") === ownerUid
    && String(booking.email || "").trim().toLowerCase() === email
    && booking.status === "Approved"
    && booking.stayStatus === "checked_in"
    && booking.checkedInAt
    && !booking.checkedOutAt
    && String(booking.checkOut || "") >= today,
  )
}
