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
  "checkInInstructionsConfigured",
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
  return ref
}

export function writeResortAdminNotification(transaction, db, event) {
  const record = buildResortAdminNotification(event)
  const ref = db
    .collection("resortOwners")
    .doc(record.ownerUid)
    .collection("adminNotifications")
    .doc()
  transaction.create(ref, record)
  return ref
}

export function writeResortAdminEvent(transaction, db, event) {
  const auditRef = writeResortAdminAudit(transaction, db, event)
  const notificationRef = event.notification
    ? writeResortAdminNotification(transaction, db, {
        ...event.notification,
        ownerUid: event.ownerUid,
        entityType: event.entityType,
        entityId: event.entityId,
      })
    : null
  return { auditRef, notificationRef }
}
