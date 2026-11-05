import { escapeInvoiceHtml } from "@/lib/booking-invoice-helpers"

export function renderBookingEmailLayout({ title, greeting, message, brandName }) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937"><h2>${escapeInvoiceHtml(title)}</h2><p>${escapeInvoiceHtml(greeting)}</p><p>${escapeInvoiceHtml(message)}</p><p style="margin-top:24px">Regards,<br>${escapeInvoiceHtml(brandName || "Resort Team")}</p></div>`
}