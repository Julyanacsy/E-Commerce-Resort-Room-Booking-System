import { jsPDF } from "jspdf"
import { formatInvoiceDate, formatInvoiceMoney } from "@/lib/booking-invoice-helpers"

export function createBookingInvoicePdf(invoice) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" })
  const left = 48
  let y = 56
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(22)
  pdf.text(invoice.business.name.slice(0, 80), left, y)
  pdf.setFontSize(18)
  pdf.text("INVOICE", 420, y)
  y += 28
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  for (const line of [invoice.business.address, invoice.business.phone, invoice.business.email].filter(Boolean)) {
    pdf.text(line.slice(0, 100), left, y)
    y += 14
  }
  pdf.text(`Invoice: ${invoice.invoiceId}`, 420, y)
  pdf.text(`Issued: ${formatInvoiceDate(invoice.issuedAt)}`, 420, y + 14)
  y += 32
  pdf.setDrawColor(190)
  pdf.line(left, y, 548, y)
  y += 24
  pdf.setFont("helvetica", "bold")
  pdf.text("Bill to", left, y)
  y += 16
  pdf.setFont("helvetica", "normal")
  for (const line of [invoice.guest.name, invoice.guest.email, invoice.guest.phone].filter(Boolean)) {
    pdf.text(line.slice(0, 100), left, y)
    y += 14
  }
  y += 18
  const detailLines = [
    `Room: ${invoice.stay.roomType}`,
    `Stay: ${invoice.stay.checkIn} to ${invoice.stay.checkOut} (${invoice.stay.nights} nights)`,
    `Guests: ${invoice.stay.guests}`,
    `Booking reference: ${invoice.bookingId}`,
  ]
  for (const line of detailLines) {
    pdf.text(line.slice(0, 110), left, y)
    y += 15
  }
  y += 20
  pdf.setFont("helvetica", "bold")
  pdf.text("Description", left, y)
  pdf.text("Qty", 365, y, { align: "right" })
  pdf.text("Rate", 445, y, { align: "right" })
  pdf.text("Amount", 548, y, { align: "right" })
  y += 10
  pdf.line(left, y, 548, y)
  y += 20
  pdf.setFont("helvetica", "normal")
  const item = invoice.lineItems[0]
  pdf.text(item.description.slice(0, 54), left, y)
  pdf.text(String(item.quantity), 365, y, { align: "right" })
  pdf.text(formatInvoiceMoney(item.unitPrice), 445, y, { align: "right" })
  pdf.text(formatInvoiceMoney(item.amount), 548, y, { align: "right" })
  y += 26
  pdf.setFont("helvetica", "bold")
  pdf.text(`Total: ${formatInvoiceMoney(invoice.total)}`, 548, y, { align: "right" })
  y += 24
  pdf.setFont("helvetica", "normal")
  pdf.text(`Payment status: ${invoice.paymentStatus}`, left, y)
  return Buffer.from(pdf.output("arraybuffer"))
}