import {
  DEFAULT_RESERVATION_DEPOSIT_PERCENT,
  normalizeReservationDepositPercent,
} from "./payment-domain.mjs"

function getConfiguredValue(primary, primaryKey, legacy, legacyKey) {
  const primaryValue = primary[primaryKey]
  const value = typeof primaryValue === "string" && primaryValue.trim()
    ? primaryValue
    : legacy[legacyKey]
  return String(value || "").trim()
}

export function resolveResortPaymentSettings(owner = {}, legacy = {}) {
  return {
    gcashQrImage: getConfiguredValue(owner, "gcashQrImage", legacy, "gcashQrUrl"),
    paymentInstructions: getConfiguredValue(owner, "paymentInstructions", legacy, "instructions"),
    reservationDepositPercent: normalizeReservationDepositPercent(
      owner.reservationDepositPercent ?? legacy.reservationDepositPercent ?? DEFAULT_RESERVATION_DEPOSIT_PERCENT,
    ),
  }
}
