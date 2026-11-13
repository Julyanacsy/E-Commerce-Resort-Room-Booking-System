function addDays(date, amount) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + amount)
  return parsed.toISOString().slice(0, 10)
}

function wasSent(booking, kind) {
  return booking.reminderEmails?.[kind]?.status === "sent"
}

export function getDueBookingReminderKinds(booking, today) {
  const tomorrow = addDays(today, 1)
  const due = []
  const approved = booking.status === "Approved"

  if (approved && !booking.confirmationEmailSentAt && !wasSent(booking, "confirmation")) {
    due.push("confirmation")
  }
  if (
    approved
    && booking.checkIn === tomorrow
    && !["checked_in", "checked_out"].includes(String(booking.stayStatus || ""))
    && !wasSent(booking, "checkIn")
  ) {
    due.push("checkIn")
  }
  if (
    approved
    && booking.checkOut === tomorrow
    && booking.stayStatus !== "checked_out"
    && !wasSent(booking, "checkOut")
  ) {
    due.push("checkOut")
  }

  return due
}
