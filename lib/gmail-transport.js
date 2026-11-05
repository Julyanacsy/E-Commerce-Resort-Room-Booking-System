import nodemailer from "nodemailer"
import { normalizeSmtpPassword } from "@/lib/mail-credentials"

function buildAuth(user, pass) {
  const u = String(user || "").trim()
  const p = normalizeSmtpPassword(pass)
  return { user: u, pass: p }
}

export function createGmailTransport(user, pass) {
  const { user: u, pass: p } = buildAuth(user, pass)
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: u, pass: p },
  })
}

function transport465(user, pass) {
  const { user: u, pass: p } = buildAuth(user, pass)
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: u, pass: p },
  })
}

function transport587(user, pass) {
  const { user: u, pass: p } = buildAuth(user, pass)
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: u, pass: p },
    requireTLS: true,
  })
}

/**
 * Picks the first Gmail endpoint that passes `verify()` (465 then 587).
 * Helps when port 465 is blocked but 587 works.
 */
export async function getGmailTransporterForSend(user, pass) {
  const t465 = transport465(user, pass)
  try {
    await t465.verify()
    return t465
  } catch (e465) {
    const t587 = transport587(user, pass)
    await t587.verify()
    return t587
  }
}
