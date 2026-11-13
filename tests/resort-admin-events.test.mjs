import assert from "node:assert/strict"
import test from "node:test"
import {
  buildResortAdminNotification,
  buildResortAuditRecord,
} from "../lib/resort-admin-events.mjs"

test("audit records retain actor and safe change fields while excluding private payloads", () => {
  const record = buildResortAuditRecord({
    ownerUid: "resort-a",
    action: "payment.received",
    entityType: "booking",
    entityId: "booking-1",
    summary: "Payment recorded",
    actorUid: "staff-1",
    actorEmail: "staff@example.com",
    actorRole: "finance",
    before: { paymentStatus: "proof_submitted", proofOfPaymentImage: "data:image/secret" },
    after: { paymentStatus: "paid", paymentAmount: 1200, guestEmail: "guest@example.com" },
  })

  assert.equal(record.ownerUid, "resort-a")
  assert.equal(record.actorUid, "staff-1")
  assert.deepEqual(record.before, { paymentStatus: "proof_submitted" })
  assert.deepEqual(record.after, { paymentStatus: "paid", paymentAmount: 1200 })
  assert.equal(record.outcome, "success")
  assert.ok(record.createdAt instanceof Date)
})

test("admin notifications start unread and contain no guest payment evidence", () => {
  const notification = buildResortAdminNotification({
    ownerUid: "resort-a",
    type: "payment.received",
    title: "Payment received",
    message: "A payment was recorded for booking booking-1.",
    entityType: "booking",
    entityId: "booking-1",
    proofOfPaymentImage: "data:image/secret",
  })

  assert.equal(notification.read, false)
  assert.equal(notification.entityId, "booking-1")
  assert.equal("proofOfPaymentImage" in notification, false)
})

test("event records validate identifiers and bounded display text", () => {
  assert.throws(
    () => buildResortAuditRecord({ ownerUid: "", action: "room.update" }),
    /Invalid resort event ownerUid/,
  )
  assert.equal(
    buildResortAdminNotification({
      ownerUid: "resort-a",
      type: "booking.new",
      title: "N".repeat(150),
      message: "A booking is waiting.",
      entityType: "booking",
    }).title.length,
    100,
  )
})
