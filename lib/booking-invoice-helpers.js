export function escapeInvoiceHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
    return entities[character]
  })
}

export function formatInvoiceDate(value) {
  if (!value) return "—"
  const date = value?.toDate?.() || new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" }).format(date)
}

export function formatInvoiceMoney(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function calculateBookingNights(checkIn, checkOut) {
  const start = new Date(`${checkIn}T00:00:00Z`)
  const end = new Date(`${checkOut}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000))
}