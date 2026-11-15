export const DEFAULT_RESERVATION_DEPOSIT_PERCENT = 30

export function normalizeReservationDepositPercent(value) {
  const percent = Number(value)
  return Number.isInteger(percent) && percent >= 1 && percent <= 100
    ? percent
    : DEFAULT_RESERVATION_DEPOSIT_PERCENT
}

export function calculateReservationDeposit(total, percent) {
  const amount = Number(total)
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round((amount * normalizeReservationDepositPercent(percent)) / 100 * 100) / 100
}

export function getRecordedPaymentAmount(booking) {
  if (booking?.paymentAmount == null && booking?.paymentStatus === "paid") {
    return Math.max(0, Number(booking?.totalPrice) || 0)
  }
  const amount = Number(booking?.paymentAmount)
  if (Number.isFinite(amount) && amount >= 0) return amount
  return booking?.paymentStatus === "paid" ? Math.max(0, Number(booking?.totalPrice) || 0) : 0
}

export function getOutstandingPaymentBalance(booking) {
  const total = Math.max(0, Number(booking?.totalPrice) || 0)
  return Math.max(0, Math.round((total - getRecordedPaymentAmount(booking)) * 100) / 100)
}
