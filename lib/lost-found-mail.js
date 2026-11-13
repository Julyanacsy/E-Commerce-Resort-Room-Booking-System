import {
  getResortAdminMailDisplayName,
  resolveAdminInboxEmail,
  resolveCentralEnvMail,
} from "@/lib/central-env-mail"

export async function sendLostFoundEmail({ to, subject, text, html, replyTo }) {
  const mail = await resolveCentralEnvMail()
  if (!mail.ok) {
    console.warn("Lost and Found email was not sent:", mail.message)
    return false
  }

  const recipient = String(to || "").trim()
  if (!recipient) {
    console.warn("Lost and Found email was not sent because no recipient email is configured.")
    return false
  }

  try {
    await mail.transporter.sendMail({
      from: `"${getResortAdminMailDisplayName()}" <${mail.user}>`,
      to: recipient,
      replyTo: String(replyTo || mail.replyTo || "").trim() || mail.replyTo,
      subject: String(subject || "Lost and Found update").replace(/[\r\n]/g, " ").slice(0, 200),
      text,
      html,
    })
    return true
  } catch (error) {
    console.error("Failed to send Lost and Found email:", error)
    return false
  }
}

export async function getLostFoundStaffInboxEmail(db, ownerUid) {
  try {
    const snapshot = await db.collection("resortOwners").doc(ownerUid).collection("site").doc("branding").get()
    const resortEmail = String(snapshot.get("email") || "").trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resortEmail)) return resortEmail
  } catch (error) {
    console.error("Failed to load resort Lost and Found contact email:", error)
  }

  const mail = await resolveCentralEnvMail()
  return mail.ok
    ? resolveAdminInboxEmail({ brandingEmail: mail.brandingEmail, replyTo: mail.replyTo, smtpUser: mail.user })
    : ""
}
