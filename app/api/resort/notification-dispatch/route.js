import { FieldValue } from "firebase-admin/firestore"
import { resolveAdminInboxEmail, resolveCentralEnvMail } from "@/lib/central-env-mail"
import { getBookingDb, jsonFailure } from "@/lib/booking-api-server"
import { resolveNotificationRecipientEmails } from "@/lib/resort-notification-policy.mjs"

const MAX_EVENTS_PER_RUN = 50
const PROCESSING_LEASE_MS = 10 * 60 * 1000

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character])
}

function validEmail(value) {
  const email = String(value || "").trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function toMillis(value) {
  return value?.toDate?.().getTime() ?? new Date(value || 0).getTime()
}

async function claimOutboxEvent(db, ref, now) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists || snapshot.get("status") === "sent") return false
    const status = String(snapshot.get("status") || "")
    const nextAttemptAt = toMillis(snapshot.get("nextAttemptAt"))
    if (status === "processing" && now.getTime() - toMillis(snapshot.get("processingAt")) < PROCESSING_LEASE_MS) {
      return false
    }
    if (status === "failed" && nextAttemptAt > now.getTime()) return false
    transaction.update(ref, {
      status: "processing",
      processingAt: now,
      attempts: Number(snapshot.get("attempts") || 0) + 1,
    })
    return true
  })
}

async function markEmailDelivered(db, ref, email) {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists || snapshot.get("status") !== "processing") return
    transaction.update(ref, {
      deliveredEmails: FieldValue.arrayUnion(email),
      updatedAt: new Date(),
    })
  })
}

async function markEventFailed(db, ref, error) {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists || snapshot.get("status") !== "processing") return
    const attempts = Number(snapshot.get("attempts") || 1)
    const delayMs = Math.min(6 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(attempts - 1, 8)))
    transaction.update(ref, {
      status: "failed",
      lastError: String(error?.message || error || "Email delivery failed").slice(0, 500),
      nextAttemptAt: new Date(Date.now() + delayMs),
      updatedAt: new Date(),
    })
  })
}

export async function GET(request) {
  const secret = String(process.env.CRON_SECRET || "").trim()
  if (!secret) return jsonFailure("Notification delivery is not configured.", 503)
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonFailure("Authentication required.", 401)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)
  const mail = await resolveCentralEnvMail()
  if (!mail.ok) {
    console.error("Transaction notification email unavailable:", mail.code, mail.message)
    return jsonFailure("Transaction notification email is not configured.", 503)
  }

  let candidates
  try {
    const outbox = db.collection("resortNotificationOutbox")
    const pending = await outbox
      .where("status", "==", "pending")
      .limit(MAX_EVENTS_PER_RUN)
      .get()
    const candidateDocs = [...pending.docs]
    const remaining = MAX_EVENTS_PER_RUN - candidateDocs.length
    if (remaining > 0) {
      const failed = await outbox
        .where("status", "==", "failed")
        .where("nextAttemptAt", "<=", new Date())
        .orderBy("nextAttemptAt", "asc")
        .limit(remaining)
        .get()
      candidateDocs.push(...failed.docs)
    }
    const finalRemaining = MAX_EVENTS_PER_RUN - candidateDocs.length
    if (finalRemaining > 0) {
      const expiredProcessing = await outbox
        .where("status", "==", "processing")
        .where("processingAt", "<=", new Date(Date.now() - PROCESSING_LEASE_MS))
        .orderBy("processingAt", "asc")
        .limit(finalRemaining)
        .get()
      candidateDocs.push(...expiredProcessing.docs)
    }
    candidates = { docs: candidateDocs }
  } catch (error) {
    console.error("Failed to load transaction notification outbox:", error)
    return jsonFailure("Transaction notifications could not be loaded.", 500)
  }

  let sentCount = 0
  let failedCount = 0
  let skippedCount = 0
  for (const candidate of candidates.docs) {
    const now = new Date()
    try {
      if (!await claimOutboxEvent(db, candidate.ref, now)) {
        skippedCount += 1
        continue
      }

      const event = candidate.data()
      let ownerEmail = ""
      let staffInvitations = []
      if (!(event.entityType === "platform" && event.platformAdminRecipient === true)) {
        const ownerSnapshot = await db.collection("resortOwners").doc(String(event.ownerUid || "")).get()
        ownerEmail = ownerSnapshot.get("email")
        const staffSnapshot = await db.collection("resortOwners")
          .doc(String(event.ownerUid || ""))
          .collection("staffInvitations")
          .get()
        staffInvitations = staffSnapshot.docs.map((invitation) => ({
          ...invitation.data(),
          id: invitation.id,
        }))
      }
      const platformAdminEmail = event.entityType === "platform" && event.platformAdminRecipient === true
        ? resolveAdminInboxEmail({
            brandingEmail: mail.brandingEmail,
            replyTo: mail.replyTo,
            smtpUser: mail.user,
          })
        : ""
      const recipientSet = new Set(resolveNotificationRecipientEmails({
        event,
        ownerEmail,
        staffInvitations,
        platformAdminEmail,
      }))

      const delivered = new Set(candidate.get("deliveredEmails") || [])
      const recipients = [...recipientSet].filter((email) => !delivered.has(email))
      if (recipients.length === 0 && delivered.size === 0) {
        throw new Error("No valid email recipients were found for this notification.")
      }
      const customerEmails = new Set(
        (Array.isArray(event.customerEmails) ? event.customerEmails : [])
          .filter(validEmail)
          .map((email) => String(email).trim().toLowerCase()),
      )
      for (const email of recipients) {
        const title = String(event.title || "Resort transaction update").slice(0, 100)
        const message = String(event.message || "A resort transaction was completed.").slice(0, 1000)
        const footer = customerEmails.has(email)
          ? "For help with your stay, contact the resort directly."
          : event.platformAdminRecipient
            ? "Open the Super Admin dashboard to review this platform update."
            : "Open your resort dashboard to review this update."
        await mail.transporter.sendMail({
          from: `"${mail.brandName}" <${mail.user}>`,
          to: email,
          replyTo: mail.replyTo,
          subject: `${mail.brandName}: ${title}`,
          text: `${title}\n\n${message}\n\n${footer}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#134e4a"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><p>${escapeHtml(footer)}</p></div>`,
        })
        await markEmailDelivered(db, candidate.ref, email)
      }

      await candidate.ref.update({
        status: "sent",
        sentAt: new Date(),
        recipientCount: recipientSet.size,
        updatedAt: new Date(),
      })
      sentCount += 1
    } catch (error) {
      console.error(`Failed to deliver resort notification ${candidate.id}:`, error)
      try {
        await markEventFailed(db, candidate.ref, error)
      } catch (updateError) {
        console.error(`Failed to schedule notification retry ${candidate.id}:`, updateError)
      }
      failedCount += 1
    }
  }

  return Response.json({ success: failedCount === 0, sentCount, failedCount, skippedCount })
}
