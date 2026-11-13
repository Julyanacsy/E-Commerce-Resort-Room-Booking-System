const MAX_PHOTO_DATA_URL_CHARS = 120_000
const PHOTO_DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export function isValidLostFoundPhoto(value) {
  return typeof value === "string"
    && value.length <= MAX_PHOTO_DATA_URL_CHARS
    && PHOTO_DATA_URL_PATTERN.test(value)
}

export function isValidFoundDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateFoundItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false
  return typeof item.description === "string"
      && item.description.trim().length > 0
      && item.description.trim().length <= 1200
    && isValidFoundDate(item.foundDate)
    && typeof item.location === "string"
      && item.location.trim().length > 0
      && item.location.trim().length <= 200
    && (item.pickupLocation == null || (
      typeof item.pickupLocation === "string" && item.pickupLocation.trim().length <= 200
    ))
    && isValidLostFoundPhoto(item.photo)
}

export function validateLostItemClaim(claim) {
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return false
  const name = typeof claim.name === "string" ? claim.name.trim() : ""
  const email = typeof claim.email === "string" ? claim.email.trim() : ""
  const contact = typeof claim.contact === "string" ? claim.contact.trim() : ""
  const reservationId = typeof claim.reservationId === "string" ? claim.reservationId.trim() : ""
  const checkIn = typeof claim.checkIn === "string" ? claim.checkIn : ""
  const checkOut = typeof claim.checkOut === "string" ? claim.checkOut : ""
  const message = claim.message == null ? "" : claim.message
  return name.length > 0
    && name.length <= 100
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && email.length <= 254
    && contact.length > 0
    && contact.length <= 80
    && /^[A-Za-z0-9_-]{6,128}$/.test(reservationId)
    && isValidFoundDate(checkIn)
    && isValidFoundDate(checkOut)
    && checkIn < checkOut
    && typeof message === "string"
    && message.trim().length <= 1000
}

export function normalizeClaimPhone(value) {
  return String(value || "").replace(/\D/g, "")
}

export function normalizeClaimName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase()
}

function timestampDate(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : new Date(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function manilaDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (type) => parts.find((value) => value.type === type)?.value || ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function isVerifiedLostItemBooking(claim, item, booking) {
  const status = String(booking?.status || "")
  const stayStatus = String(booking?.stayStatus || "")
  const checkedInAt = timestampDate(booking?.checkedInAt)
  const checkedOutAt = timestampDate(booking?.checkedOutAt)
  return ["Approved", "Completed"].includes(status)
    && stayStatus === "checked_out"
    && Boolean(checkedInAt && checkedOutAt && checkedOutAt >= checkedInAt)
    && item.foundDate >= manilaDate(checkedInAt)
    && item.foundDate <= manilaDate(checkedOutAt)
    && normalizeClaimName(claim.name) === normalizeClaimName(booking.name)
    && String(claim.email || "").trim().toLowerCase() === String(booking.email || "").trim().toLowerCase()
    && normalizeClaimPhone(claim.contact) === normalizeClaimPhone(booking.phone)
    && claim.checkIn === String(booking.checkIn || "")
    && claim.checkOut === String(booking.checkOut || "")
    && item.foundDate >= claim.checkIn
    && item.foundDate <= claim.checkOut
}

export function escapeLostFoundHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character])
}
