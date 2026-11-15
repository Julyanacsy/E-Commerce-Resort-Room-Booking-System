import assert from "node:assert/strict"
import test from "node:test"
import { canAccessStaffPage } from "../lib/staff-page-access.mjs"

test("staff page access matches each assigned role", () => {
  assert.equal(canAccessStaffPage("admin", "manage-bookings"), true)
  assert.equal(canAccessStaffPage("admin", "booking-history"), true)
  assert.equal(canAccessStaffPage("admin", "staff-management"), false)

  assert.equal(canAccessStaffPage("front-desk", "booking-calendar"), true)
  assert.equal(canAccessStaffPage("front-desk", "payment-integration"), true)
  assert.equal(canAccessStaffPage("front-desk", "booking-history"), false)
  assert.equal(canAccessStaffPage("front-desk", "manage-inventory"), false)

  assert.equal(canAccessStaffPage("finance", "payment-integration"), true)
  assert.equal(canAccessStaffPage("finance", "booking-history"), true)
  assert.equal(canAccessStaffPage("finance", "manage-bookings"), false)
  assert.equal(canAccessStaffPage("finance", "lost-and-found"), false)
})

test("owner and legacy helpdesk access preserve existing portal visibility", () => {
  assert.equal(canAccessStaffPage("owner", "staff-management"), true)
  assert.equal(canAccessStaffPage("owner", "brand-settings"), true)
  assert.equal(canAccessStaffPage("admin", "brand-settings", { isLegacyHelpdesk: true }), true)
  assert.equal(canAccessStaffPage("admin", "audit-log", { isLegacyHelpdesk: true }), false)
  assert.equal(canAccessStaffPage("unknown", "manage-bookings"), false)
})
