import assert from "node:assert/strict"
import test from "node:test"
import { getDueBookingReminderKinds } from "../lib/booking-reminder-domain.mjs"

test("sends confirmation and one-day check-in and checkout reminders", () => {
  const booking = {
    status: "Approved",
    checkIn: "2026-03-11",
    checkOut: "2026-03-11",
  }

  assert.deepEqual(getDueBookingReminderKinds(booking, "2026-03-10"), [
    "confirmation",
    "checkIn",
    "checkOut",
  ])
})

test("does not resend confirmation or remind guests who already checked in", () => {
  const booking = {
    status: "Approved",
    confirmationEmailSentAt: new Date(),
    checkIn: "2026-03-11",
    checkOut: "2026-03-11",
    stayStatus: "checked_in",
  }

  assert.deepEqual(getDueBookingReminderKinds(booking, "2026-03-10"), ["checkOut"])
})

test("does not send date reminders except the day before", () => {
  const booking = {
    status: "Approved",
    checkIn: "2026-03-10",
    checkOut: "2026-03-12",
  }

  assert.deepEqual(getDueBookingReminderKinds(booking, "2026-03-10"), ["confirmation"])
})
