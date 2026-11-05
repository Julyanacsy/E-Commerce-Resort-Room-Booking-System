import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { normalizeSmtpPassword } from "@/lib/mail-credentials"
import { getGmailTransporterForSend } from "@/lib/gmail-transport"

export function sanitizeMailDisplayName(raw) {
  const s = String(raw || "LuxeStay").trim() || "LuxeStay"
  const cleaned = s.replace(/["\\\r\n]/g, "").slice(0, 70)
  return cleaned || "LuxeStay"
}

/** Unified SMTP `From` display name for all outbound system emails */
export function getResortAdminMailDisplayName() {
  return sanitizeMailDisplayName("Resort Admin")
}

/** Public read: `settings/branding` (display name + contact email for templates). */
export async function getBrandingMailContext() {
  try {
    const ref = doc(db, "settings", "branding")
    const snap = await getDoc(ref)
    const data = snap.exists() ? snap.data() : {}
    const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "LuxeStay"
    const brandingEmail = typeof data.email === "string" && data.email.trim() ? data.email.trim() : ""
    return { name: sanitizeMailDisplayName(name), brandingEmail }
  } catch (e) {
    console.warn("getBrandingMailContext:", e?.message)
    return { name: "LuxeStay", brandingEmail: "" }
  }
}

export function getEnvSmtpCredentials() {
  const user = String(process.env.EMAIL_USER || "").trim()
  const pass = normalizeSmtpPassword(process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || "")
  if (!user || !pass) return null
  const replyTo = String(process.env.EMAIL_REPLY_TO || process.env.ADMIN_EMAIL || user).trim()
  return { user, pass, replyTo: replyTo || user }
}

/**
 * One mailbox for OTP, contact, feedback, booking status, super-admin resort notify.
 */
export async function resolveCentralEnvMail() {
  const creds = getEnvSmtpCredentials()
  const { name: brandName, brandingEmail } = await getBrandingMailContext()
  if (!creds) {
    return {
      ok: false,
      code: "NO_ENV_MAIL",
      message: "Set EMAIL_USER and EMAIL_PASSWORD (or EMAIL_PASS) in the server environment.",
      brandName,
      brandingEmail,
    }
  }
  try {
    const transporter = await getGmailTransporterForSend(creds.user, creds.pass)
    return {
      ok: true,
      transporter,
      user: creds.user,
      pass: creds.pass,
      replyTo: creds.replyTo,
      brandName,
      brandingEmail,
    }
  } catch (e) {
    console.warn("resolveCentralEnvMail verify:", e?.message)
    const gmailHint =
      " Gmail (smtp.gmail.com): sign in must use an App Password (16 letters), not your normal Gmail password — Google Account → Security → 2-Step Verification → App passwords. EMAIL_USER must be that same Gmail address."
    return {
      ok: false,
      code: "SMTP_VERIFY_FAILED",
      message: String(e?.message || "Gmail SMTP verification failed.") + gmailHint,
      brandName,
      brandingEmail,
    }
  }
}

export function resolveAdminInboxEmail({ brandingEmail, replyTo, smtpUser }) {
  const fromEnv = String(process.env.ADMIN_EMAIL || "").trim()
  if (fromEnv) return fromEnv
  if (brandingEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brandingEmail)) return brandingEmail
  const r = String(replyTo || "").trim()
  if (r && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)) return r
  return String(smtpUser || "").trim() || null
}
