import assert from "node:assert/strict"
import test from "node:test"
import {
  buildResortAdminNotification,
  buildResortAuditRecord,
  writeResortAdminAudit,
  writeResortAdminNotification,
} from "../lib/resort-admin-events.mjs"
import {
  getResortNotificationPolicy,
} from "../lib/resort-notification-policy.mjs"
import { isLowStock, validateInventoryItem } from "../lib/inventory-domain.mjs"
import {
  getInspectionFindings,
  validateInspectionEntries,
  validateRoomItem,
} from "../lib/room-inspection-domain.mjs"
import { resolveResortPaymentSettings } from "../lib/resort-payment-settings.mjs"

test("resort payment settings merge root and legacy fields independently", () => {
  assert.deepEqual(
    resolveResortPaymentSettings(
      { paymentInstructions: "Use the resort name as reference." },
      { gcashQrUrl: "data:image/png;base64,qr", instructions: "Legacy instructions" },
    ),
    {
      gcashQrImage: "data:image/png;base64,qr",
      paymentInstructions: "Use the resort name as reference.",
      reservationDepositPercent: 30,
    },
  )
  assert.deepEqual(
    resolveResortPaymentSettings({}, {}),
    { gcashQrImage: "", paymentInstructions: "", reservationDepositPercent: 30 },
  )
  assert.equal(resolveResortPaymentSettings({ reservationDepositPercent: 45 }).reservationDepositPercent, 45)
  assert.equal(resolveResortPaymentSettings({ reservationDepositPercent: 101 }).reservationDepositPercent, 30)
  assert.deepEqual(
    resolveResortPaymentSettings(
      { gcashQrImage: "", paymentInstructions: "" },
      { gcashQrUrl: "legacy-qr", instructions: "Legacy instructions" },
    ),
    { gcashQrImage: "legacy-qr", paymentInstructions: "Legacy instructions", reservationDepositPercent: 30 },
  )
})

test("inventory validation requires bounded names and non-negative integer stock values", () => {
  assert.equal(validateInventoryItem({
    name: "Bath towels",
    category: "Housekeeping",
    quantity: 4,
    lowStockThreshold: 5,
  }), true)
  assert.equal(validateInventoryItem({
    name: "Towels",
    category: "Housekeeping",
    quantity: 1.5,
    lowStockThreshold: 5,
  }), false)
  assert.equal(validateInventoryItem({
    name: " ",
    category: "Housekeeping",
    quantity: 2,
    lowStockThreshold: 1,
  }), false)
  assert.equal(isLowStock({ quantity: 5, lowStockThreshold: 5 }), true)
  assert.equal(isLowStock({ quantity: 6, lowStockThreshold: 5 }), false)
})

test("room inspection detects refill and replacement needs and validates every tracked item", () => {
  const roomItems = [
    { id: "towels", expectedQuantity: 4 },
    { id: "kettle", expectedQuantity: 1 },
  ]
  assert.equal(validateRoomItem({
    name: "Bath towel",
    category: "Bathroom",
    itemType: "supply",
    expectedQuantity: 4,
  }), true)
  assert.equal(validateRoomItem({
    name: "Kettle",
    category: "Appliances",
    itemType: "other",
    expectedQuantity: 1,
  }), false)
  const entries = [
    { itemId: "towels", quantity: 2, condition: "good", note: "" },
    { itemId: "kettle", quantity: 1, condition: "damaged", note: "" },
  ]
  assert.equal(validateInspectionEntries(entries, roomItems), true)
  assert.equal(validateInspectionEntries(entries.slice(1), roomItems), false)
  assert.deepEqual(getInspectionFindings([
    { itemId: "towels", name: "Bath towel", quantity: 2, expectedQuantity: 4, condition: "good" },
    { itemId: "kettle", name: "Kettle", quantity: 1, expectedQuantity: 1, condition: "damaged" },
  ]), [
    {
      itemId: "towels",
      name: "Bath towel",
      category: undefined,
      restockQuantity: 2,
      needsReplacement: false,
      condition: "good",
    },
    {
      itemId: "kettle",
      name: "Kettle",
      category: undefined,
      restockQuantity: 0,
      needsReplacement: true,
      condition: "damaged",
    },
  ])
})

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

test("notification policies route transactions to the assigned resort roles", () => {
  assert.deepEqual(getResortNotificationPolicy("booking.status-updated", "booking").roles, ["admin", "front-desk"])
  assert.deepEqual(getResortNotificationPolicy("payment.received", "booking").roles, ["admin", "finance"])
  assert.deepEqual(getResortNotificationPolicy("contact.status", "contact-message").roles, ["admin", "front-desk"])
  assert.deepEqual(getResortNotificationPolicy("item-mark-claimed", "lost-found-item").roles, ["admin", "front-desk"])
  assert.deepEqual(getResortNotificationPolicy("item.create", "room-inventory-item").roles, ["admin"])
  assert.equal(getResortNotificationPolicy("platform.application-approved", "platform"), null)
})

test("direct resort notifications inherit role audiences and queue only valid guest emails", () => {
  const writes = []
  let nextId = 0
  const makeCollection = (path) => ({
    doc(id = `generated-${++nextId}`) {
      const ref = {
        id,
        path: `${path}/${id}`,
        collection(name) {
          return makeCollection(`${path}/${id}/${name}`)
        },
      }
      return ref
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

test("audited resort transactions queue guest emails without storing them in audit data", () => {
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
