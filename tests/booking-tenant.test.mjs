import assert from "node:assert/strict"
import test from "node:test"
import { isPlaceholderOwnerUid, normalizeOwnerUidFromSearchParam } from "../lib/booking-tenant.js"

test("template owner IDs are never accepted as resort booking IDs", () => {
  for (const placeholder of ["<owner_uid>", "<uid>", "owner_uid", "your-owner-uid", "placeholder"]) {
    assert.equal(isPlaceholderOwnerUid(placeholder), true)
    assert.equal(normalizeOwnerUidFromSearchParam(placeholder), null)
  }

  assert.equal(normalizeOwnerUidFromSearchParam("realFirebaseOwnerId123"), "realFirebaseOwnerId123")
})
