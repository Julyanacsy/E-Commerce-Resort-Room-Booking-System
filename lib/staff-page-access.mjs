const STAFF_PAGE_ACCESS = {
  admin: new Set([
    "manage-inventory",
    "room-item-monitoring",
    "lost-and-found",
    "manage-bookings",
    "booking-calendar",
    "booking-history",
    "payment-integration",
  ]),
  "front-desk": new Set([
    "room-item-monitoring",
    "lost-and-found",
    "manage-bookings",
    "booking-calendar",
    "payment-integration",
  ]),
  finance: new Set(["booking-history", "payment-integration"]),
}

const LEGACY_HIDDEN_PAGES = new Set([
  "audit-log",
  "manage-inventory",
  "room-item-monitoring",
])

export function canAccessStaffPage(role, page, { isLegacyHelpdesk = false } = {}) {
  if (isLegacyHelpdesk) return !LEGACY_HIDDEN_PAGES.has(page)
  if (role === "owner") return true
  return STAFF_PAGE_ACCESS[role]?.has(page) ?? false
}
