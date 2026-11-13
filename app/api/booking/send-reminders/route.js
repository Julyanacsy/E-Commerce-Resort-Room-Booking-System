import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import { renderBookingEmailLayout } from "@/lib/booking-email-layout"
import { getBookingDb, getManilaDate, jsonFailure } from "@/lib/booking-api-server"
import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"
import { getDueBookingReminderKinds } from "@/lib/booking-reminder-domain.mjs"

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
  const sent = []
  const failures = []
  const ownerSettings = new Map()

  try {
    const snapshot = await db
      .collection("guestbooking")
      .where("status", "in", ["Approved", "Completed"])
      .limit(2000)
      .get()
    for (const item of snapshot.docs) {
      const booking = item.data()
      if (!booking.email) continue

      const ownerUid = String(booking.ownerUid || "")
      let ownerData = {}
      if (ownerUid && !ownerSettings.has(ownerUid)) {
        const ownerSnapshot = await db.collection("resortOwners").doc(ownerUid).get()
        ownerSettings.set(ownerUid, ownerSnapshot.exists ? ownerSnapshot.data() : {})
      }
      ownerData = ownerUid ? ownerSettings.get(ownerUid) || {} : {}
      const instructions = String(ownerData.checkInInstructions || "").trim()
      const rules = String(ownerData.resortRulesText || "").trim()
      const reminderKinds = getDueBookingReminderKinds(booking, today)

      for (const kind of reminderKinds) {
        try {
          let reminder
          if (kind === "confirmation") {
            reminder = {
              title: "Booking confirmed",
              message: `Your booking for ${booking.roomType || "your room"} from ${booking.checkIn} to ${booking.checkOut} is approved.`,
              subject: `Booking confirmed: ${item.id}`,
              details: [
                ...(rules ? [{ title: "Resort rules and regulations", body: rules }] : []),
                ...(instructions ? [{ title: "Check-in instructions", body: instructions }] : []),
              ],
            }
          } else if (kind === "checkIn") {
            reminder = {
              title: "Check-in reminder",
              message: `Your stay at ${booking.roomType || "the resort"} begins tomorrow, ${booking.checkIn}.`,
              subject: `Check-in reminder: ${item.id}`,
              details: instructions ? [{ title: "Check-in instructions", body: instructions }] : [],
            }
          } else if (kind === "checkOut") {
            reminder = {
              title: "Check-out reminder",
              message: `Your stay at ${booking.roomType || "the resort"} ends tomorrow, ${booking.checkOut}. Please follow the resort's check-out time and return any keys or access items.`,
              subject: `Check-out reminder: ${item.id}`,
            }
          } else if (kind === "checkOut") {
            reminder = {
              title: "Check-out reminder",
              message: `Your stay at ${booking.roomType || "the resort"} ends tomorrow, ${booking.checkOut}. Please follow the resort's check-out time and return any keys or access items.`,
              subject: `Check-out reminder: ${item.id}`,
            }
          }

          await mail.transporter.sendMail({
            from: `"${mail.brandName}" <${mail.user}>`,
            to: booking.email,
            replyTo: mail.replyTo,
            subject: reminder.subject,
            text: `${reminder.message}\nBooking reference: ${item.id}${reminder.details?.length
              ? `\n\n${reminder.details.map((detail) => `${detail.title}:\n${detail.body}`).join("\n\n")}`
              : ""}`,
            html: renderBookingEmailLayout({
              title: reminder.title,
              greeting: `Hello ${booking.name || "Guest"},`,
              message: `${reminder.message} Booking reference: ${item.id}.`,
              brandName: mail.brandName,
              details: reminder.details,
            }),
          })
          await db.runTransaction(async (transaction) => {
            const current = await transaction.get(item.ref)
            if (!current.exists) throw new Error("BOOKING_NOT_FOUND")
            transaction.update(item.ref, {
              ...(kind === "confirmation"
                ? { confirmationEmailSentAt: new Date() }
                : {}),
              [`reminderEmails.${kind}`]: {
                status: "sent",
                sentAt: new Date(),
              },
            })
            if (current.get("ownerUid")) {
              writeResortAdminAudit(transaction, db, {
                ownerUid: String(current.get("ownerUid")),
                actorUid: "system:scheduled-reminders",
                actorEmail: "",
                actorRole: "system",
                action: `booking.${kind}-email-sent`,
                entityType: "booking",
                entityId: item.id,
                summary: `Scheduled ${kind} email was sent successfully.`,
              })
            }
          })
          sent.push({ bookingId: item.id, kind })
        } catch (error) {
          console.error(`Failed to send ${kind} reminder for booking ${item.id}:`, error)
          failures.push({ bookingId: item.id, kind })
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
