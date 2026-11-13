import assert from "node:assert/strict"
import test from "node:test"
import { writePlatformAdminNotification } from "../lib/resort-admin-events.mjs"
import { resolveNotificationRecipientEmails } from "../lib/resort-notification-policy.mjs"

test("resort email notifications go to the owner, active matching staff, and guest", () => {
  const recipients = resolveNotificationRecipientEmails({
    event: {
      entityType: "booking",
      actorUid: "staff-actor",
      audienceRoles: ["admin", "finance"],
      customerEmails: [" GUEST@example.com ", "owner@example.com", "invalid"],
    },
    ownerEmail: "OWNER@example.com",
    staffInvitations: [
      { id: "admin@example.com", uid: "staff-admin", role: "admin", status: "approved", active: true },
      { email: "finance@example.com", uid: "staff-finance", role: "finance", status: "approved", active: true },
      { email: "actor@example.com", uid: "staff-actor", role: "finance", status: "approved", active: true },
      { email: "frontdesk@example.com", uid: "staff-front", role: "front-desk", status: "approved", active: true },
      { email: "pending@example.com", uid: "staff-pending", role: "admin", status: "pending", active: true },
    ],
  })

  assert.deepEqual(recipients, [
    "owner@example.com",
    "admin@example.com",
    "finance@example.com",
    "guest@example.com",
  ])
})

test("platform notification email is restricted to the Super Admin inbox", () => {
  const recipients = resolveNotificationRecipientEmails({
    event: {
      entityType: "platform",
      platformAdminRecipient: true,
      actorUid: "super-admin",
      audienceRoles: [],
      customerEmails: ["guest@example.com"],
    },
    ownerEmail: "owner@example.com",
    staffInvitations: [
      { email: "staff@example.com", uid: "staff-1", role: "admin", status: "approved", active: true },
    ],
    platformAdminEmail: "ADMIN@example.com",
  })

  assert.deepEqual(recipients, ["admin@example.com"])
  assert.deepEqual(resolveNotificationRecipientEmails({
    event: { entityType: "platform", platformAdminRecipient: true },
    platformAdminEmail: "not-an-email",
  }), [])
})

test("platform notification events enqueue a roleless outbox record", () => {
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

  writePlatformAdminNotification(transaction, db, {
    type: "resort.registration-submitted",
    title: "Resort registration needs review",
    message: "A resort submitted details for review.",
    resortId: "resort-a",
    ownerUid: "owner-a",
    actorUid: "owner-a",
  })

  const notification = writes.find(({ path }) => path.startsWith("superAdminNotifications/"))
  const outbox = writes.find(({ path }) => path.startsWith("resortNotificationOutbox/"))
  assert.equal(notification.data.resortId, "resort-a")
  assert.equal(outbox.data.platformAdminRecipient, true)
  assert.deepEqual(outbox.data.audienceRoles, [])
  assert.deepEqual(outbox.data.customerEmails, [])
})
