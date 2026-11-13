import assert from "node:assert/strict"
import test from "node:test"
import {
  buildResortAdminNotification,
  buildResortAuditRecord,
  writeResortAdminAudit,
  writeResortAdminNotification,
} from "../lib/resort-admin-events.mjs"
import { getResortNotificationPolicy } from "../lib/resort-notification-policy.mjs"

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

test("notification policies route transactions to their assigned resort roles", () => {
  assert.deepEqual(getResortNotificationPolicy("booking.status-updated", "booking").roles, ["admin", "front-desk"])
  assert.deepEqual(getResortNotificationPolicy("payment.received", "booking").roles, ["admin", "finance"])
  assert.equal(getResortNotificationPolicy("platform.application-approved", "platform"), null)
})

test("resort notifications queue only valid guest emails and use the policy roles", () => {
  const writes = []
  let nextId = 0
  const makeCollection = (path) => ({
    doc(id = `generated-${++nextId}`) {
      return {
        id,
        path: `${path}/${id}`,
        collection(name) {
          return makeCollection(`${path}/${id}/${name}`)
        },
      }
    },
  })
  const db = { collection: (name) => makeCollection(name) }
  const transaction = { create: (ref, data) => writes.push({ path: ref.path, data }) }

  writeResortAdminNotification(transaction, db, {
    ownerUid: "resort-a",
    action: "payment.received",
    type: "payment.received",
    title: "Payment received",
    message: "A payment was recorded.",
    entityType: "booking",
    customerEmails: ["guest@example.com", "not-an-email"],
  })

  const notification = writes.find(({ path }) => path.includes("adminNotifications"))
  const outbox = writes.find(({ path }) => path.startsWith("resortNotificationOutbox/"))
  assert.deepEqual(notification.data.audienceRoles, ["admin", "finance"])
  assert.deepEqual(outbox.data.audienceRoles, ["admin", "finance"])
  assert.deepEqual(outbox.data.customerEmails, ["guest@example.com"])
})

test("audited resort transactions enqueue guest mail without storing recipient emails in audit records", () => {
  const writes = []
  let nextId = 0
  const makeCollection = (path) => ({
    doc(id = `generated-${++nextId}`) {
      return {
        id,
        path: `${path}/${id}`,
        collection(name) {
          return makeCollection(`${path}/${id}/${name}`)
        },
      }
    },
  })
  const db = { collection: (name) => makeCollection(name) }
  const transaction = { create: (ref, data) => writes.push({ path: ref.path, data }) }

  writeResortAdminAudit(transaction, db, {
    ownerUid: "resort-a",
    actorUid: "staff-1",
    actorEmail: "staff@example.com",
    actorRole: "admin",
    action: "booking.status-updated",
    entityType: "booking",
    entityId: "booking-1",
    summary: "Booking approved.",
    emailRecipients: ["guest@example.com"],
  })

  const audit = writes.find(({ path }) => path.includes("auditLogs"))
  const outbox = writes.find(({ path }) => path.startsWith("resortNotificationOutbox/"))
  assert.equal("emailRecipients" in audit.data, false)
  assert.deepEqual(outbox.data.customerEmails, ["guest@example.com"])
})
