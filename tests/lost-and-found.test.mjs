import assert from "node:assert/strict"
import test from "node:test"
import {
  isValidFoundDate,
  isValidLostFoundPhoto,
  isVerifiedLostItemBooking,
  escapeLostFoundHtml,
  normalizeClaimName,
  normalizeClaimPhone,
  validateFoundItem,
  validateLostItemClaim,
} from "../lib/lost-and-found.mjs"

const photo = `data:image/jpeg;base64,${"a".repeat(100)}`

test("found item validation requires bounded description, location, date, and image", () => {
  assert.equal(validateFoundItem({ description: "Blue towel", foundDate: "2026-11-12", location: "Pool", photo }), true)
  assert.equal(validateFoundItem({ description: "", foundDate: "2026-11-12", location: "Pool", photo }), false)
  assert.equal(validateFoundItem({ description: "Bag", foundDate: "2026-02-29", location: "Lobby", photo }), false)
  assert.equal(validateFoundItem({ description: "Bag", foundDate: "2026-11-12", location: "Lobby", photo: "https://example.test/image.jpg" }), false)
})

test("found-item photos only accept bounded base64 image data URLs", () => {
  assert.equal(isValidLostFoundPhoto(photo), true)
  assert.equal(isValidLostFoundPhoto(`data:text/html;base64,${"a".repeat(100)}`), false)
  assert.equal(isValidLostFoundPhoto(`data:image/jpeg;base64,${"a".repeat(350_001)}`), false)
})

test("found dates reject impossible calendar dates", () => {
  assert.equal(isValidFoundDate("2028-02-29"), true)
  assert.equal(isValidFoundDate("2026-02-29"), false)
})

test("lost-item claims require contact details and bound optional messages", () => {
  const claim = {
    name: "Guest",
    email: "guest@example.com",
    contact: "+63 900 000 0000",
    reservationId: "booking_123456",
    checkIn: "2026-11-10",
    checkOut: "2026-11-12",
    message: "I left this near the pool.",
  }
  assert.equal(validateLostItemClaim(claim), true)
  assert.equal(validateLostItemClaim({ ...claim, email: "invalid" }), false)
  assert.equal(validateLostItemClaim({ ...claim, contact: "" }), false)
  assert.equal(validateLostItemClaim({ ...claim, reservationId: "x" }), false)
  assert.equal(validateLostItemClaim({ ...claim, checkOut: "2026-11-10" }), false)
  assert.equal(validateLostItemClaim({ ...claim, message: "x".repeat(1001) }), false)
})

test("claim matching normalizes guest name spacing and contact digits only", () => {
  assert.equal(normalizeClaimName("  GUEST   Name "), "guest name")
  assert.equal(normalizeClaimPhone("+63 (900) 000-0000"), "639000000000")
})

test("found item pickup point and message content are bounded and escaped", () => {
  const foundItem = { description: "Wallet", foundDate: "2026-11-12", location: "Pool", photo }
  assert.equal(validateFoundItem({ ...foundItem, pickupLocation: "Front Desk" }), true)
  assert.equal(validateFoundItem({ ...foundItem, pickupLocation: "x".repeat(201) }), false)
  assert.equal(escapeLostFoundHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
})

test("lost-item claims require an approved checked-out booking and matching stay records", () => {
  const claim = {
    name: "Guest Name",
    email: "guest@example.com",
    contact: "+63 900 000 0000",
    reservationId: "booking_123456",
    checkIn: "2026-11-10",
    checkOut: "2026-11-12",
  }
  const item = { foundDate: "2026-11-11" }
  const booking = {
    name: "Guest Name",
    email: "guest@example.com",
    phone: "639000000000",
    checkIn: "2026-11-10",
    checkOut: "2026-11-12",
    status: "Completed",
    stayStatus: "checked_out",
    checkedInAt: new Date("2026-11-10T07:00:00Z"),
    checkedOutAt: new Date("2026-11-12T03:00:00Z"),
  }
  assert.equal(isVerifiedLostItemBooking(claim, item, booking), true)
  assert.equal(isVerifiedLostItemBooking(claim, item, { ...booking, stayStatus: "not_checked_in" }), false)
  assert.equal(isVerifiedLostItemBooking(claim, item, { ...booking, checkedOutAt: null }), false)
  assert.equal(isVerifiedLostItemBooking(claim, item, { ...booking, email: "other@example.com" }), false)
  assert.equal(isVerifiedLostItemBooking(claim, { foundDate: "2026-11-15" }, booking), false)
  assert.equal(isVerifiedLostItemBooking(claim, item, { ...booking, checkedOutAt: new Date("2026-11-10T09:00:00Z") }), false)
})
