import assert from "node:assert/strict"
import test from "node:test"
import {
  bookingBelongsToTenant,
  isPlaceholderOwnerUid,
  normalizeOwnerUidFromSearchParam,
  roomBelongsToTenant,
} from "../lib/booking-tenant.js"
import { isKamayanHelpdeskEmail } from "../lib/kamayan-helpdesk.mjs"

test("template owner IDs are never accepted as resort booking IDs", () => {
  for (const placeholder of ["<owner_uid>", "<uid>", "owner_uid", "your-owner-uid", "placeholder"]) {
    assert.equal(isPlaceholderOwnerUid(placeholder), true)
    assert.equal(normalizeOwnerUidFromSearchParam(placeholder), null)
  }

  assert.equal(normalizeOwnerUidFromSearchParam("realFirebaseOwnerId123"), "realFirebaseOwnerId123")
})
test("Kamayan helpdesk identification is normalized and exact", () => {
  assert.equal(isKamayanHelpdeskEmail("resort.helpdesk01@gmail.com"), true)
  assert.equal(isKamayanHelpdeskEmail("  RESORT.HELPDESK01@gmail.com "), true)
  assert.equal(isKamayanHelpdeskEmail("another@example.com"), false)
})

test("legacy unowned rooms and bookings are included only for the explicitly configured owner", () => {
  const ownerUid = "kamayan-owner"
  assert.equal(roomBelongsToTenant({}, ownerUid, ownerUid), true)
  assert.equal(roomBelongsToTenant({ ownerUid: "another-owner" }, ownerUid, ownerUid), false)
  assert.equal(roomBelongsToTenant({}, ownerUid, null), false)
  assert.equal(bookingBelongsToTenant({}, ownerUid, ownerUid), true)
  assert.equal(bookingBelongsToTenant({ ownerUid: "another-owner" }, ownerUid, ownerUid), false)
  assert.equal(bookingBelongsToTenant({}, ownerUid, null), false)
})
