import { isApprovedStaffInvitation } from "./booking-domain.mjs"

const ROLE_RECIPIENTS = {
  "booking.created": ["admin", "front-desk"],
  "booking.status-updated": ["admin", "front-desk"],
  "booking.cancelled": ["admin", "front-desk"],
  "booking.walk-in-created": ["admin", "front-desk"],
  "booking.check-in": ["admin", "front-desk"],
  "booking.check-out": ["admin", "front-desk"],
  "booking.auto-completed": ["admin", "front-desk"],
  "payment.received": ["admin", "finance"],
  "payment.rejected": ["admin", "finance"],
  "refund.updated": ["admin", "finance"],
  "contact-message.created": ["admin", "front-desk"],
  "contact.status": ["admin", "front-desk"],
  "feedback.created": ["admin"],
  "feedback.status": ["admin"],
  "lost-found.item-created": ["admin", "front-desk"],
  "lost-found-claim.created": ["admin", "front-desk"],
  "lost-found-claim.approved": ["admin", "front-desk"],
  "lost-found-claim.rejected": ["admin", "front-desk"],
  "lost-found-claim.staff-reply": ["admin", "front-desk"],
  "lost-found-claim.guest-reply": ["admin", "front-desk"],
  "lost-found.item-mark-claimed": ["admin", "front-desk"],
  "lost-found.claim-approve": ["admin", "front-desk"],
  "lost-found.claim-reject": ["admin", "front-desk"],
  "lost-found.claim-reply": ["admin", "front-desk"],
  "inventory.create": ["admin"],
  "inventory.update": ["admin"],
  "inventory.archive": ["admin"],
  "inventory.restore": ["admin"],
  "room.create": ["admin"],
  "room.update": ["admin"],
  "room.archive": ["admin"],
  "room.restore": ["admin"],
  "room-item.create": ["admin"],
  "room-item.update": ["admin"],
  "room-item.archive": ["admin"],
  "room-item.restore": ["admin"],
  "room-item.item.create": ["admin"],
  "room-item.item.update": ["admin"],
  "room-item.item.archive": ["admin"],
  "room-item.item.restore": ["admin"],
  "inspection.pre-check-in": ["admin", "front-desk"],
  "inspection.post-check-out": ["admin", "front-desk"],
  "inspection.resolve": ["admin", "front-desk"],
  "item.create": ["admin"],
  "item.update": ["admin"],
  "item.archive": ["admin"],
  "item.restore": ["admin"],
  "staff.invited": [],
  "staff.approved": [],
  "staff.revoked": [],
  "listing.save": [],
  "listing.publish": [],
  "branding.update": [],
  "payment-settings.update": [],
  "reminder-settings.update": [],
}

const ACTION_LABELS = {
  "booking.created": "New booking",
  "booking.status-updated": "Booking updated",
  "booking.cancelled": "Booking cancelled",
  "booking.walk-in-created": "Walk-in booking",
  "booking.check-in": "Guest checked in",
  "booking.check-out": "Guest checked out",
  "booking.auto-completed": "Booking completed",
  "payment.received": "Payment received",
  "payment.rejected": "Payment rejected",
  "refund.updated": "Refund updated",
  "contact-message.created": "New contact message",
  "feedback.created": "New guest feedback",
  "feedback.status": "Guest feedback updated",
  "lost-found.item-created": "Lost and Found updated",
  "lost-found-claim.created": "New Lost and Found claim",
  "lost-found-claim.approved": "Lost and Found claim approved",
  "lost-found-claim.rejected": "Lost and Found claim rejected",
  "lost-found-claim.staff-reply": "Lost and Found conversation updated",
  "lost-found-claim.guest-reply": "Lost and Found conversation updated",
  "inventory.create": "Inventory updated",
  "inventory.update": "Inventory updated",
  "inventory.archive": "Inventory updated",
  "inventory.restore": "Inventory updated",
  "room.create": "Room updated",
  "room.update": "Room updated",
  "room.archive": "Room updated",
  "room.restore": "Room updated",
  "room-item.create": "Room items updated",
  "room-item.update": "Room items updated",
  "room-item.archive": "Room items updated",
  "room-item.restore": "Room items updated",
  "room-item.item.create": "Room items updated",
  "room-item.item.update": "Room items updated",
  "room-item.item.archive": "Room items updated",
  "room-item.item.restore": "Room items updated",
  "inspection.pre-check-in": "Room inspection updated",
  "inspection.post-check-out": "Room inspection updated",
  "inspection.resolve": "Room inspection updated",
  "item.create": "Room items updated",
  "item.update": "Room items updated",
  "item.archive": "Room items updated",
  "item.restore": "Room items updated",
  "staff.invited": "Staff access updated",
  "staff.approved": "Staff access updated",
  "staff.revoked": "Staff access updated",
  "listing.save": "Resort listing updated",
  "listing.publish": "Resort listing published",
  "branding.update": "Resort branding updated",
  "payment-settings.update": "Payment settings updated",
  "reminder-settings.update": "Guest settings updated",
  "contact.status": "Contact message updated",
}

const ACTION_ALIASES = {
  "booking.new": "booking.created",
  "lost-found-claim-message": "lost-found-claim.guest-reply",
  "lost-found-claim": "lost-found-claim.created",
}

function validEmail(value) {
  const email = String(value || "").trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function resolveNotificationRecipientEmails({
  event,
  ownerEmail,
  staffInvitations = [],
  platformAdminEmail,
}) {
  const recipients = new Set()
  if (event?.entityType === "platform" && event.platformAdminRecipient === true) {
    if (validEmail(platformAdminEmail)) {
      recipients.add(String(platformAdminEmail).trim().toLowerCase())
    }
    return [...recipients]
  }

  if (validEmail(ownerEmail)) recipients.add(String(ownerEmail).trim().toLowerCase())
  const roles = new Set(Array.isArray(event?.audienceRoles) ? event.audienceRoles : [])
  for (const staff of staffInvitations) {
    const email = staff?.email || staff?.id
    if (
      validEmail(email)
      && staff?.uid !== event?.actorUid
      && roles.has(String(staff?.role || ""))
      && isApprovedStaffInvitation(staff)
    ) recipients.add(String(email).trim().toLowerCase())
  }
  for (const email of Array.isArray(event?.customerEmails) ? event.customerEmails : []) {
    if (validEmail(email)) recipients.add(String(email).trim().toLowerCase())
  }
  return [...recipients]
}

export function getResortNotificationPolicy(action, entityType = "") {
  let key = ACTION_ALIASES[String(action || "")] || String(action || "")
  if (entityType === "room-inventory-item" && key.startsWith("item.")) {
    key = `room-item.${key}`
  }
  if (entityType === "lost-found-item" && key === "item-mark-claimed") {
    key = "lost-found.item-mark-claimed"
  }
  if (entityType === "lost-found-claim" && key.startsWith("claim-")) {
    key = `lost-found.${key}`
  }
  const roles = ROLE_RECIPIENTS[key]
  if (!roles) return null
  return {
    roles: [...roles],
    title: ACTION_LABELS[key] || "Resort update",
  }
}

export function shouldNotifyResortRole(action, role, entityType = "") {
  const policy = getResortNotificationPolicy(action, entityType)
  return Boolean(policy && policy.roles.includes(String(role || "")))
}
