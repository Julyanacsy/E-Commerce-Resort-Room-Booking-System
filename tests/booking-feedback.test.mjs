import assert from "node:assert/strict"
import test from "node:test"
import {
  createBookingFeedbackToken,
  canAccessGuestWifi,
  hashBookingFeedbackToken,
  isFeedbackInviteActive,
  isValidBookingFeedbackToken,
  validateGuestFeedback,
} from "../lib/booking-feedback.mjs"
import { getDueBookingReminderKinds } from "../lib/booking-reminder-domain.mjs"

test("booking feedback tokens are unique, URL safe, and stored as one-way hashes", () => {
  const first = createBookingFeedbackToken()
  const second = createBookingFeedbackToken()
  assert.equal(isValidBookingFeedbackToken(first), true)
  assert.equal(isValidBookingFeedbackToken(second), true)
  assert.notEqual(first, second)
  assert.equal(hashBookingFeedbackToken(first).length, 64)
  assert.notEqual(hashBookingFeedbackToken(first), first)
  assert.equal(hashBookingFeedbackToken("invalid"), "")
})

test("feedback invites require the active token, completed stay, and an unused unexpired booking", () => {
  const now = new Date("2026-11-13T00:00:00.000Z")
  const booking = {
    id: "booking-1",
    ownerUid: "resort-1",
    status: "Completed",
    stayStatus: "checked_out",
    feedbackTokenHash: "token-hash",
  }
  const invite = {
    bookingId: booking.id,
    ownerUid: booking.ownerUid,
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
  }
  assert.equal(isFeedbackInviteActive(invite, booking, now), true)
  assert.equal(isFeedbackInviteActive(invite, { ...booking, feedbackTokenHash: "newer-token-hash" }, now), true)
  assert.equal(isFeedbackInviteActive({ ...invite, usedAt: now }, booking, now), false)
  assert.equal(isFeedbackInviteActive({ ...invite, revokedAt: now }, booking, now), false)
  assert.equal(isFeedbackInviteActive(invite, { ...booking, stayStatus: "checked_in" }, now), false)
})

test("feedback submissions require a rating from one to five and a bounded message", () => {
  assert.equal(validateGuestFeedback({ rating: 5, message: "Wonderful stay" }), true)
  assert.equal(validateGuestFeedback({ rating: 0, message: "Wonderful stay" }), false)
  assert.equal(validateGuestFeedback({ rating: 4.5, message: "Wonderful stay" }), false)
  assert.equal(validateGuestFeedback({ rating: 4, message: "  " }), false)
  assert.equal(validateGuestFeedback({ rating: 4, message: "x".repeat(5001) }), false)
})

test("Wi-Fi access requires the matching resort guest to be currently checked in", () => {
  const owner = { status: "approved" }
  const booking = {
    ownerUid: "resort-1",
    email: "guest@example.com",
    status: "Approved",
    stayStatus: "checked_in",
    checkedInAt: new Date(),
    checkOut: "2026-11-14",
  }
  assert.equal(canAccessGuestWifi(booking, owner, "resort-1", "guest@example.com", "2026-11-13"), true)
  assert.equal(canAccessGuestWifi(booking, owner, "resort-2", "guest@example.com", "2026-11-13"), false)
  assert.equal(canAccessGuestWifi(booking, owner, "resort-1", "other@example.com", "2026-11-13"), false)
  assert.equal(canAccessGuestWifi({ ...booking, stayStatus: "checked_out" }, owner, "resort-1", "guest@example.com", "2026-11-13"), false)
  assert.equal(canAccessGuestWifi({ ...booking, checkOut: "2026-11-12" }, owner, "resort-1", "guest@example.com", "2026-11-13"), false)
  assert.equal(canAccessGuestWifi(booking, { status: "pending" }, "resort-1", "guest@example.com", "2026-11-13"), false)
})

test("scheduled reminders target the exact day before check-in and checkout once", () => {
  const booking = {
    status: "Approved",
    checkIn: "2026-11-14",
    checkOut: "2026-11-16",
    stayStatus: "not_checked_in",
  }
  assert.deepEqual(getDueBookingReminderKinds(booking, "2026-11-13"), [
    "confirmation",
    "checkIn",
  ])
  assert.deepEqual(
    getDueBookingReminderKinds({ ...booking, reminderEmails: { checkIn: { status: "sent" } } }, "2026-11-13"),
    ["confirmation"],
  )
  assert.deepEqual(getDueBookingReminderKinds(booking, "2026-11-15"), ["confirmation", "checkOut"])
  assert.deepEqual(getDueBookingReminderKinds(booking, "2026-11-16"), ["confirmation"])
})

test("post-checkout feedback follow-up only runs for a verified checked-out stay", () => {
  const booking = {
    status: "Completed",
    checkOut: "2026-11-12",
    stayStatus: "checked_out",
  }
  assert.deepEqual(getDueBookingReminderKinds(booking, "2026-11-13"), ["followUp"])
  assert.deepEqual(
    getDueBookingReminderKinds({ ...booking, stayStatus: "not_checked_in" }, "2026-11-13"),
    [],
  )
  assert.deepEqual(
    getDueBookingReminderKinds({ ...booking, reminderEmails: { followUp: { status: "sent" } } }, "2026-11-13"),
    [],
  )
})
