import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateReservationDeposit,
  DEFAULT_RESERVATION_DEPOSIT_PERCENT,
  getOutstandingPaymentBalance,
  getRecordedPaymentAmount,
  normalizeReservationDepositPercent,
} from "../lib/payment-domain.mjs"

test("reservation deposit percentages default safely and stay within the supported range", () => {
  assert.equal(DEFAULT_RESERVATION_DEPOSIT_PERCENT, 30)
  assert.equal(normalizeReservationDepositPercent(45), 45)
  assert.equal(normalizeReservationDepositPercent("50"), 50)
  assert.equal(normalizeReservationDepositPercent(0), 30)
  assert.equal(normalizeReservationDepositPercent(101), 30)
  assert.equal(normalizeReservationDepositPercent(12.5), 30)
})

test("deposit and balance amounts are rounded to cents without exceeding the total", () => {
  assert.equal(calculateReservationDeposit(1000, 30), 300)
  assert.equal(calculateReservationDeposit(999.99, 30), 300)
  assert.equal(calculateReservationDeposit(1000, 100), 1000)
  assert.equal(calculateReservationDeposit(-1, 30), 0)
})

test("recorded payments and outstanding balance account for partial and legacy paid bookings", () => {
  const partiallyPaid = { totalPrice: 1000, paymentAmount: 300, paymentStatus: "partially_paid" }
  assert.equal(getRecordedPaymentAmount(partiallyPaid), 300)
  assert.equal(getOutstandingPaymentBalance(partiallyPaid), 700)
  assert.equal(getRecordedPaymentAmount({ totalPrice: 1000, paymentStatus: "paid" }), 1000)
  assert.equal(getOutstandingPaymentBalance({ totalPrice: 1000, paymentStatus: "paid" }), 0)
  assert.equal(getOutstandingPaymentBalance({ totalPrice: 1000, paymentAmount: 1200 }), 0)
})
