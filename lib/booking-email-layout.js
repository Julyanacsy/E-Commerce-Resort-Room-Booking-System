import { escapeInvoiceHtml } from "@/lib/booking-invoice-helpers"

export function renderBookingEmailLayout({ title, greeting, message, brandName, details = [], actionLink = null }) {
  const detailMarkup = details
    .filter((detail) => detail && detail.title && detail.body)
    .map((detail) =>
      `<section style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px"><h3 style="margin:0 0 8px;color:#065f46">${escapeInvoiceHtml(detail.title)}</h3><p style="margin:0;white-space:pre-wrap">${escapeInvoiceHtml(detail.body)}</p></section>`,
    )
    .join("")
  const actionMarkup = actionLink?.href && actionLink?.label
    ? `<p style="margin:24px 0"><a href="${escapeInvoiceHtml(actionLink.href)}" style="display:inline-block;padding:12px 20px;background:#047857;color:#fff;text-decoration:none;border-radius:8px">${escapeInvoiceHtml(actionLink.label)}</a></p>`
    : ""
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937"><h2>${escapeInvoiceHtml(title)}</h2><p>${escapeInvoiceHtml(greeting)}</p><p style="white-space:pre-wrap">${escapeInvoiceHtml(message)}</p>${detailMarkup}${actionMarkup}<p style="margin-top:24px">Regards,<br>${escapeInvoiceHtml(brandName || "Resort Team")}</p></div>`
}