import { calculateBookingNights } from "@/lib/booking-invoice-helpers"

export function buildBookingInvoice(booking, business = {}) {
  const nights = Number(booking.nights) || calculateBookingNights(booking.checkIn, booking.checkOut)
  const rate = Number(booking.pricePerNight) || 0
  const total = Number(booking.totalPrice) || rate * nights
  const invoiceId = `INV-${String(booking.id || "").slice(-10).toUpperCase()}`
  return {
    invoiceId,
    bookingId: String(booking.id || ""),
    issuedAt: new Date(),
    business: {
      name: String(business.name || "Resort"),
      address: String(business.address || ""),
      phone: String(business.phone || ""),
      email: String(business.email || ""),
    },
    guest: {
      name: String(booking.name || ""),
      email: String(booking.email || ""),
      phone: String(booking.phone || ""),
    },
    stay: {
      roomType: String(booking.roomType || "Room"),
      checkIn: String(booking.checkIn || ""),
      checkOut: String(booking.checkOut || ""),
      nights,
      guests: Number(booking.guests) || 1,
    },
    lineItems: [
      {
        description: `${String(booking.roomType || "Room")} accommodation (${nights} night${nights === 1 ? "" : "s"})`,
        quantity: nights,
        unitPrice: rate,
        amount: total,
      },
    ],
    total,
    paymentStatus: String(booking.paymentStatus || "unpaid"),
    paymentMethod: String(booking.paymentMethod || ""),
    bookingStatus: String(booking.status || "Pending"),
  }
}

export function buildBookingReceipt(booking, business = {}) {
  const amount = Number(booking.paymentAmount ?? booking.totalPrice) || 0
  const paidAt = booking.paymentReviewedAt?.toDate?.() || new Date(booking.paymentReviewedAt || Date.now())
  const bookingSuffix = String(booking.id || "").slice(-10).toUpperCase()
  const dateSuffix = Number.isNaN(paidAt.getTime()) ? Date.now() : paidAt.getTime()
  const invoice = buildBookingInvoice({ ...booking, totalPrice: amount, paymentStatus: "paid" }, business)
  return {
    ...invoice,
    invoiceId: `RCT-${bookingSuffix}-${dateSuffix}`,
    documentType: "receipt",
    issuedAt: paidAt,
    total: amount,
    paymentAmount: amount,
    lineItems: [
      {
        description: `Payment received for ${String(booking.roomType || "booking")}`,
        quantity: 1,
        unitPrice: amount,
        amount,
      },
    ],
  }
}