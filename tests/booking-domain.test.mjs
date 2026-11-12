import assert from "node:assert/strict"
import test from "node:test"
import {
  bookingBelongsToTenant,
  canManageBooking,
  canTransitionBookingStatus,
  datesBetween,
  getBookingDateLockId,
  getPaymentActionError,
  getStaffInvitationIndexError,
  hasActiveBookingConflict,
  hasBookingPermission,
  isApprovedStaffInvitation,
  normalizeDate,
  overlaps,
} from "../lib/booking-domain.mjs"

test("date parsing and stay dates validate calendar dates and checkout-exclusive nights", () => {
  assert.equal(normalizeDate("2026-02-29"), null)
  assert.equal(normalizeDate("2028-02-29"), "2028-02-29")
  assert.deepEqual(datesBetween("2026-11-10", "2026-11-12"), ["2026-11-10", "2026-11-11"])
  assert.equal(datesBetween("2026-11-12", "2026-11-12"), null)
})

test("date ranges allow checkout on another guest's check-in day", () => {
  assert.equal(overlaps("2026-11-12", "2026-11-14", "2026-11-10", "2026-11-12"), false)
  assert.equal(overlaps("2026-11-11", "2026-11-13", "2026-11-10", "2026-11-12"), true)
})

test("availability conflict checks only active bookings belonging to the selected tenant", () => {
  const bookings = [
    { ownerUid: "resort-a", status: "Approved", checkIn: "2026-11-10", checkOut: "2026-11-12" },
    { ownerUid: "resort-a", status: "Cancelled", checkIn: "2026-11-12", checkOut: "2026-11-14" },
    { ownerUid: "resort-b", status: "Pending", checkIn: "2026-11-10", checkOut: "2026-11-12" },
    { status: "Pending", checkIn: "2026-11-10", checkOut: "2026-11-12" },
  ]

  assert.equal(
    hasActiveBookingConflict(bookings, {
      checkIn: "2026-11-11",
      checkOut: "2026-11-13",
      ownerUid: "resort-a",
    }),
    true,
  )
  assert.equal(
    hasActiveBookingConflict(bookings, {
      checkIn: "2026-11-12",
      checkOut: "2026-11-14",
      ownerUid: "resort-a",
    }),
    false,
  )
  assert.equal(
    hasActiveBookingConflict(bookings, {
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
      ownerUid: "resort-c",
    }),
    false,
  )
  assert.equal(
    hasActiveBookingConflict(bookings, {
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
      ownerUid: "resort-a",
      legacyUid: "resort-a",
    }),
    true,
  )
})

test("tenant ownership rules isolate bookings and handle legacy resort data", () => {
  assert.equal(bookingBelongsToTenant({ ownerUid: "resort-a" }, "resort-a"), true)
  assert.equal(bookingBelongsToTenant({ ownerUid: "resort-b" }, "resort-a"), false)
  assert.equal(bookingBelongsToTenant({}, "resort-a", "resort-a"), true)
  assert.equal(bookingBelongsToTenant({}, "resort-a", "resort-b"), false)
  assert.equal(canManageBooking({ ownerUid: "resort-a" }, { ownerUid: "resort-b" }), false)
})

test("staff permissions remain scoped to assigned roles", () => {
  const frontDesk = { staffRole: "front-desk" }
  const finance = { staffRole: "finance" }

  assert.equal(hasBookingPermission(frontDesk, "booking"), true)
  assert.equal(hasBookingPermission(frontDesk, "payment"), false)
  assert.equal(hasBookingPermission(finance, "payment"), true)
  assert.equal(hasBookingPermission(finance, "booking"), false)
  assert.equal(hasBookingPermission({ isOwner: true }, "staff"), true)
})

test("staff invitations require approval while preserving legacy active invitations", () => {
  assert.equal(isApprovedStaffInvitation({ status: "pending", active: false }), false)
  assert.equal(isApprovedStaffInvitation({ status: "revoked", active: false }), false)
  assert.equal(isApprovedStaffInvitation({ status: "approved", active: true }), true)
  assert.equal(isApprovedStaffInvitation({ status: "approved", active: false }), false)
  assert.equal(isApprovedStaffInvitation({ active: true }), true)
  assert.equal(isApprovedStaffInvitation({ active: false }), false)
})

test("staff collection-group index failures show the actionable Firebase setup", () => {
  assert.equal(getStaffInvitationIndexError({ code: 7, message: "permission denied" }), null)
  assert.match(
    getStaffInvitationIndexError({ code: 9, message: "FAILED_PRECONDITION" }),
    /staffInvitations\.email.*ascending order/,
  )
  assert.match(
    getStaffInvitationIndexError({
      code: "failed-precondition",
      message: "Create it: https://console.firebase.google.com/index?create=1",
    }),
    /https:\/\/console\.firebase\.google\.com\/index\?create=1/,
  )
})

test("booking status transitions reject invalid or terminal transitions", () => {
  assert.equal(canTransitionBookingStatus("Pending", "Approved"), true)
  assert.equal(canTransitionBookingStatus("Pending", "Declined"), true)
  assert.equal(canTransitionBookingStatus("Pending", "Cancelled"), false)
  assert.equal(canTransitionBookingStatus("Approved", "Cancelled"), true)
  assert.equal(canTransitionBookingStatus("Completed", "Approved"), false)
})

test("payment actions enforce payment status and required evidence", () => {
  assert.equal(getPaymentActionError("record-cash", "unpaid", "Pending", false, false), null)
  assert.match(getPaymentActionError("record-cash", "paid", "Pending", false, false), /already marked/)
  assert.equal(getPaymentActionError("mark-as-paid", "proof_submitted", "Pending", true, true), null)
  assert.match(getPaymentActionError("mark-as-paid", "proof_submitted", "Pending", true, false), /ID/)
  assert.equal(getPaymentActionError("reject", "proof_submitted", "Approved", true, false), null)
  assert.match(getPaymentActionError("reject", "unpaid", "Pending", true, true), /no pending/)
  assert.match(getPaymentActionError("record-cash", "unpaid", "Completed", false, false), /closed booking/)
})

test("date-lock identity is stable for the same room and night", () => {
  const lockId = getBookingDateLockId("room-key", "2026-11-10")
  assert.equal(getBookingDateLockId("room-key", "2026-11-10"), lockId)
  assert.notEqual(getBookingDateLockId("room-key", "2026-11-11"), lockId)
  assert.notEqual(getBookingDateLockId("another-room-key", "2026-11-10"), lockId)
})
