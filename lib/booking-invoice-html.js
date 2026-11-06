import {
  escapeInvoiceHtml,
  formatInvoiceDate,
  formatInvoiceMoney,
} from "@/lib/booking-invoice-helpers"

export function renderBookingInvoiceHtml(invoice) {
  const business = invoice.business
  const guest = invoice.guest
  const rows = invoice.lineItems
    .map(
      (item) => `<tr><td>${escapeInvoiceHtml(item.description)}</td><td>${item.quantity}</td><td>${formatInvoiceMoney(item.unitPrice)}</td><td>${formatInvoiceMoney(item.amount)}</td></tr>`,
    )
    .join("")
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937"><main style="max-width:760px;margin:32px auto;padding:32px;border:1px solid #e5e7eb"><header style="display:flex;justify-content:space-between"><div><h1>${escapeInvoiceHtml(business.name)}</h1><p>${escapeInvoiceHtml(business.address)}<br>${escapeInvoiceHtml(business.phone)}<br>${escapeInvoiceHtml(business.email)}</p></div><div><h2>INVOICE</h2><p>${escapeInvoiceHtml(invoice.invoiceId)}<br>Issued ${formatInvoiceDate(invoice.issuedAt)}</p></div></header><hr><section><h3>Bill to</h3><p>${escapeInvoiceHtml(guest.name)}<br>${escapeInvoiceHtml(guest.email)}<br>${escapeInvoiceHtml(guest.phone)}</p><p>Stay: ${escapeInvoiceHtml(invoice.stay.checkIn)} to ${escapeInvoiceHtml(invoice.stay.checkOut)} (${invoice.stay.nights} nights)<br>Room: ${escapeInvoiceHtml(invoice.stay.roomType)} · Guests: ${invoice.stay.guests}<br>Booking reference: ${escapeInvoiceHtml(invoice.bookingId)}</p></section><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:8px">Description</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:8px">Qty</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:8px">Rate</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:8px">Amount</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="3" style="text-align:right;padding:12px">Total</th><th style="text-align:right;padding:12px">${formatInvoiceMoney(invoice.total)}</th></tr></tfoot></table><p>Payment status: ${escapeInvoiceHtml(invoice.paymentStatus)}${invoice.paymentMethod ? `<br>Payment method: ${escapeInvoiceHtml(invoice.paymentMethod)}` : ""}</p></main></body></html>`
}