import crypto from "node:crypto"

const ACTIVE_BOOKING_STATUSES = new Set(["Pending", "Approved"])
const BOOKING_TRANSITIONS = {
  Pending: new Set(["Approved", "Declined"]),
  Approved: new Set(["Cancelled", "Completed"]),
}
const STAFF_PERMISSIONS = {
  admin: new Set(["booking", "calendar", "stay", "payment", "refund", "staff", "reminder", "lost-found"]),
  "front-desk": new Set(["booking", "calendar", "stay", "reminder", "lost-found"]),
  finance: new Set(["payment", "refund"]),
}
const PENDING_PAYMENT_STATUSES = new Set(["proof_submitted", "submitted_for_review"])

export function normalizeOwnerUid(value) {
  if (value == null) return null
  const normalized = String(value).trim()
  return normalized || null
}

export function normalizeDate(value) {
  const date = String(value || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date
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

export function isActiveBooking(booking) {
  return ACTIVE_BOOKING_STATUSES.has(String(booking?.status || "Pending"))
}

export function overlaps(checkIn, checkOut, otherCheckIn, otherCheckOut) {
  return String(otherCheckIn || "") < checkOut && String(otherCheckOut || "") > checkIn
}

export function bookingBelongsToTenant(booking, ownerUid, legacyUid) {
  const bookingOwner = normalizeOwnerUid(booking?.ownerUid)
  const normalizedOwnerUid = normalizeOwnerUid(ownerUid)
  if (!normalizedOwnerUid) return !bookingOwner
  if (legacyUid && legacyUid === normalizedOwnerUid) {
    return !bookingOwner || bookingOwner === normalizedOwnerUid
  }
  return bookingOwner === normalizedOwnerUid
}

export function hasActiveBookingConflict(bookings, { checkIn, checkOut, ownerUid, legacyUid }) {
  return bookings.some(
    (booking) =>
      bookingBelongsToTenant(booking, ownerUid, legacyUid) &&
      isActiveBooking(booking) &&
      overlaps(checkIn, checkOut, booking.checkIn, booking.checkOut),
  )
}

export function canManageBooking(user, booking) {
  const bookingOwner = normalizeOwnerUid(booking?.ownerUid)
  const ownerUid = normalizeOwnerUid(user?.ownerUid)
  return user?.isLegacyAdmin && !ownerUid
    ? !bookingOwner || bookingOwner === user.uid
    : bookingOwner === ownerUid
}

export function hasBookingPermission(user, permission) {
  if (user?.isLegacyAdmin || user?.isOwner) return true
  return STAFF_PERMISSIONS[user?.staffRole]?.has(permission) === true
}

export function isApprovedStaffInvitation(invitation) {
  const status = String(invitation?.status || "").trim().toLowerCase()
  return status
    ? status === "approved" && invitation?.active === true
    : invitation?.active === true
}

export function getStaffInvitationIndexError(error) {
  const code = String(error?.code || "").toLowerCase()
  if (code !== "9" && code !== "failed-precondition") return null
  const indexUrl = String(error?.message || "").match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/)?.[0]
  return indexUrl
    ? `Staff access requires a Firestore collection-group index. Create the required index: ${indexUrl}`
    : "Staff access requires a Firestore collection-group index on staffInvitations.email. Create it in the Firebase console with collection-group scope and ascending order."
}

export function canTransitionBookingStatus(currentStatus, nextStatus) {
  return BOOKING_TRANSITIONS[currentStatus]?.has(nextStatus) === true
}

export function getPaymentActionError(action, paymentStatus, bookingStatus, proofPresent, validIdPresent) {
  if (!["Pending", "Approved"].includes(bookingStatus)) {
    return "Payment cannot be reviewed for a closed booking."
  }
  if (action === "record-cash") {
    if (paymentStatus === "paid" || paymentStatus === "partially_paid") {
      return "This booking's reservation deposit has already been recorded."
    }
    if (PENDING_PAYMENT_STATUSES.has(paymentStatus)) {
      return "Review or reject the submitted payment proof before recording a cash deposit."
    }
    return null
  }
  if (!["mark-as-paid", "reject"].includes(action)) return "A valid payment action is required."
  if (!PENDING_PAYMENT_STATUSES.has(paymentStatus)) {
    return "This booking has no pending payment proof to review."
  }
  if (!proofPresent) return "Payment proof is missing."
  if (action === "mark-as-paid" && !validIdPresent) return "Guest ID is missing."
  return null
}

export function getBookingDateLockId(roomKey, date) {
  return crypto.createHash("sha256").update(`${roomKey}\n${date}`).digest("hex")
}
