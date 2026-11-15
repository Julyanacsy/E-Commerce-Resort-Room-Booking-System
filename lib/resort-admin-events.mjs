import { getResortNotificationPolicy } from "./resort-notification-policy.mjs"

const AUDIT_FIELDS = new Set([
  "bookingStatus",
  "paymentStatus",
  "paymentMethod",
  "paymentAmount",
  "refundAmount",
  "refundStatus",
  "refundDate",
  "stayStatus",
  "roomType",
  "role",
  "name",
  "itemName",
  "location",
  "category",
  "price",
  "quantity",
  "quantityRestocked",
  "itemCount",
  "lowStockCount",
  "replacementCount",
  "resolved",
  "availability",
  "isArchived",
  "published",
  "imageCount",
  "lowStockThreshold",
  "listingImageConfigured",
  "logoConfigured",
  "heroImageConfigured",
  "gcashQrConfigured",
  "paymentInstructionsConfigured",
  "reservationDepositPercent",
  "checkInInstructionsConfigured",
  "resortRulesConfigured",
  "wifiConfigured",
  "instructions",
  "status",
])

function safeFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) =>
        AUDIT_FIELDS.has(key)
        && (typeof item === "string" || typeof item === "number" || typeof item === "boolean"),
      )
      .map(([key, item]) => [
        key,
        typeof item === "string" ? item.slice(0, 300) : item,
      ]),
  )
}

function requiredText(value, field, maxLength) {
  const text = String(value || "").trim()
  if (!text || text.length > maxLength) {
    throw new Error(`Invalid resort event ${field}.`)
  }
  return text
}

export function buildResortAuditRecord(event, createdAt = new Date()) {
  return {
    ownerUid: requiredText(event.ownerUid, "ownerUid", 128),
    action: requiredText(event.action, "action", 80),
    entityType: requiredText(event.entityType, "entityType", 40),
    entityId: String(event.entityId || "").slice(0, 160),
    summary: requiredText(event.summary, "summary", 300),
    actorUid: requiredText(event.actorUid, "actorUid", 128),
    actorEmail: String(event.actorEmail || "").slice(0, 254),
    actorRole: String(event.actorRole || "").slice(0, 40),
    outcome: "success",
    before: safeFields(event.before),
    after: safeFields(event.after),
    createdAt,
  }
}

export function buildResortAdminNotification(event, createdAt = new Date()) {
  return {
    ownerUid: requiredText(event.ownerUid, "ownerUid", 128),
    type: requiredText(event.type, "notification type", 60),
    title: requiredText(event.title, "notification title", 300).slice(0, 100),
    message: requiredText(event.message, "notification message", 1000).slice(0, 300),
    entityType: requiredText(event.entityType, "entityType", 40),
    entityId: String(event.entityId || "").slice(0, 160),
    audienceRoles: Array.isArray(event.audienceRoles)
      ? [...new Set(event.audienceRoles.filter((role) => ["admin", "front-desk", "finance"].includes(role)))]
      : [],
    readBy: [],
    read: false,
    createdAt,
  }
}

export function writeResortAdminAudit(transaction, db, event) {
  const record = buildResortAuditRecord(event)
  const ref = db
    .collection("resortOwners")
    .doc(record.ownerUid)
    .collection("auditLogs")
    .doc()
  transaction.create(ref, record)
  const policy = getResortNotificationPolicy(event.action, record.entityType)
  const notification = event.notification || (policy
    ? { type: event.action, title: policy.title, message: record.summary }
    : null)
  const notificationRef = notification
    ? writeResortAdminNotification(transaction, db, {
        ...notification,
        action: event.action,
        audienceRoles: notification.audienceRoles || policy?.roles || [],
        customerEmails: event.emailRecipients,
        ownerUid: record.ownerUid,
        entityType: record.entityType,
        entityId: record.entityId,
        actorUid: record.actorUid,
      })
    : null
  return { auditRef: ref, notificationRef }
}

export function writeResortAdminNotification(transaction, db, event) {
  const policy = getResortNotificationPolicy(event.action || event.type, event.entityType)
  const audienceRoles = Array.isArray(event.audienceRoles) && event.audienceRoles.length
    ? event.audienceRoles
    : policy?.roles || []
  const record = buildResortAdminNotification({ ...event, audienceRoles })
  const ref = db
    .collection("resortOwners")
    .doc(record.ownerUid)
    .collection("adminNotifications")
    .doc()
  transaction.create(ref, record)
  if (policy) {
    const customerEmails = Array.isArray(event.customerEmails)
      ? [...new Set(event.customerEmails
        .map((email) => String(email || "").trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254))]
      : []
    const outboxRef = db.collection("resortNotificationOutbox").doc()
    transaction.create(outboxRef, {
      ownerUid: record.ownerUid,
      eventId: outboxRef.id,
      action: String(event.action || event.type),
      entityType: record.entityType,
      entityId: record.entityId,
      audienceRoles: record.audienceRoles.length ? record.audienceRoles : policy.roles,
      title: record.title,
      message: record.message,
      customerEmails,
      actorUid: String(event.actorUid || ""),
      status: "pending",
      attempts: 0,
      createdAt: record.createdAt,
    })
  }
  return ref
}

export function writeResortAdminEvent(transaction, db, event) {
  return writeResortAdminAudit(transaction, db, event)
}

export function writePlatformAdminNotification(transaction, db, event) {
  const record = {
    type: requiredText(event.type, "platform notification type", 60),
    title: requiredText(event.title, "platform notification title", 100),
    message: requiredText(event.message, "platform notification message", 300),
    resortId: String(event.resortId || "").slice(0, 128),
    ownerUid: String(event.ownerUid || "").slice(0, 128),
    actorUid: String(event.actorUid || "").slice(0, 128),
    read: false,
    createdAt: new Date(),
  }
  const notificationRef = db.collection("superAdminNotifications").doc()
  transaction.create(notificationRef, record)
  const outboxRef = db.collection("resortNotificationOutbox").doc()
  transaction.create(outboxRef, {
    ownerUid: record.ownerUid,
    eventId: outboxRef.id,
    action: record.type,
    entityType: "platform",
    entityId: record.resortId || record.ownerUid,
    audienceRoles: [],
    title: record.title,
    message: record.message,
    customerEmails: [],
    actorUid: record.actorUid,
    platformAdminRecipient: true,
    status: "pending",
    attempts: 0,
    createdAt: record.createdAt,
  })
  return notificationRef
}
