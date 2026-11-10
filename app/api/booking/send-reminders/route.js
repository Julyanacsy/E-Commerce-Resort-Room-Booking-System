import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import { renderBookingEmailLayout } from "@/lib/booking-email-layout"
import { getBookingDb, getManilaDate, jsonFailure } from "@/lib/booking-api-server"

function addDays(date, amount) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + amount)
  return parsed.toISOString().slice(0, 10)
}

function hasSentReminder(booking, kind) {
  return booking.reminderEmails?.[kind]?.status === "sent"
}

export async function GET(request) {
  const secret = String(process.env.CRON_SECRET || "").trim()
  if (!secret) return jsonFailure("Scheduled reminders are not configured.", 503)
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonFailure("Authentication required.", 401)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)
  const mail = await resolveCentralEnvMail()
  if (!mail.ok) {
    console.error("Scheduled reminder email unavailable:", mail.code, mail.message)
    return jsonFailure("Reminder email is not configured.", 503)
  }

  const today = getManilaDate()
  const tomorrow = addDays(today, 1)
  const yesterday = addDays(today, -1)
  const sent = []
  const failures = []

  try {
    const snapshot = await db
      .collection("guestbooking")
      .where("status", "in", ["Approved", "Completed"])
      .limit(2000)
      .get()
    for (const item of snapshot.docs) {
      const booking = item.data()
      if (!booking.email) continue

      const reminders = []
      if (booking.status === "Approved" && !booking.confirmationEmailSentAt && !hasSentReminder(booking, "confirmation")) {
        reminders.push({
          kind: "confirmation",
          title: "Booking confirmed",
          message: `Your booking for ${booking.roomType || "your room"} from ${booking.checkIn} to ${booking.checkOut} is approved.`,
          subject: `Booking confirmed: ${item.id}`,
        })
      }
      if (
        booking.status === "Approved" &&
        booking.checkIn >= today &&
        booking.checkIn <= tomorrow &&
        !hasSentReminder(booking, "checkIn")
      ) {
        const ownerSnapshot = booking.ownerUid
          ? await db.collection("resortOwners").doc(booking.ownerUid).get()
          : null
        const instructions = String(ownerSnapshot?.get("checkInInstructions") || "").trim()
        reminders.push({
          kind: "checkIn",
          title: "Your stay starts tomorrow",
          message: `We look forward to welcoming you tomorrow for your stay at ${booking.roomType || "the resort"}.${instructions ? ` Check-in instructions: ${instructions}` : " Please contact the resort if you need arrival instructions."}`,
          subject: `Check-in reminder: ${item.id}`,
        })
      }
      if (
        ["Approved", "Completed"].includes(booking.status) &&
        booking.checkOut <= yesterday &&
        booking.checkOut >= addDays(today, -7) &&
        !hasSentReminder(booking, "followUp")
      ) {
        reminders.push({
          kind: "followUp",
          title: "Thank you for staying with us",
          message: `Thank you for choosing ${mail.brandName}. We hope you enjoyed your stay and would be happy to welcome you again.`,
          subject: `Thank you for your stay: ${item.id}`,
        })
      }

      for (const reminder of reminders) {
        try {
          await mail.transporter.sendMail({
            from: `"${mail.brandName}" <${mail.user}>`,
            to: booking.email,
            replyTo: mail.replyTo,
            subject: reminder.subject,
            text: `${reminder.message}\nBooking reference: ${item.id}`,
            html: renderBookingEmailLayout({
              title: reminder.title,
              greeting: `Hello ${booking.name || "Guest"},`,
              message: `${reminder.message} Booking reference: ${item.id}.`,
              brandName: mail.brandName,
            }),
          })
          await item.ref.update({
            ...(reminder.kind === "confirmation"
              ? { confirmationEmailSentAt: new Date() }
              : {}),
            [`reminderEmails.${reminder.kind}`]: {
              status: "sent",
              sentAt: new Date(),
            },
          })
          sent.push({ bookingId: item.id, kind: reminder.kind })
        } catch (error) {
          console.error(`Failed to send ${reminder.kind} reminder for booking ${item.id}:`, error)
          failures.push({ bookingId: item.id, kind: reminder.kind })
        }
      }
    }

    if (failures.length) {
      return Response.json(
        { error: "Some booking reminders failed.", sentCount: sent.length, failedCount: failures.length },
        { status: 502 },
      )
    }
    return Response.json({ success: true, sentCount: sent.length })
  } catch (error) {
    console.error("Failed to process scheduled booking reminders:", error)
    return jsonFailure("Scheduled booking reminders could not be processed.", 500)
  }
}
