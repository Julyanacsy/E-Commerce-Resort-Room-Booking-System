import { NextResponse } from "next/server"
import { resolveResortNotifySmtpCredentials } from "@/lib/resort-notify-smtp-server"
import { getGmailTransporterForSend } from "@/lib/gmail-transport"
import { getResortAdminMailDisplayName } from "@/lib/central-env-mail"

function smtpFailureResponse(error, creds) {
  const raw = String(error?.message || error || "")
  const lower = raw.toLowerCase()
  const isAuth =
    lower.includes("535") ||
    lower.includes("badcredentials") ||
    lower.includes("invalid login") ||
    lower.includes("authentication unsuccessful") ||
    lower.includes("534-5.7.9")

  if (isAuth) {
    return NextResponse.json(
      {
        error: "Gmail rejected the username or password.",
        hint: "Wrong EMAIL_USER / app password in server .env — fix and restart the app.",
        mailSource: creds?.source,
      },
      { status: 502 },
    )
  }

  return NextResponse.json(
    {
      error: raw || "Failed to send email",
      mailSource: creds?.source,
    },
    { status: 500 },
  )
}

function getPublicBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return String(explicit).replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const EMAIL_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

function emailShell(inner) {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:24px 12px;background:#ecfdf5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="font-family:${EMAIL_FONT};">${inner}</td></tr>
  </table>
</body>
</html>`
}

function buildApprovedEmail({ resortName, adminUrl, marketplaceUrl }) {
  const name = escapeHtml(resortName)
  const subject = `You're in — ${resortName} is approved on the Resort Marketplace`
  const html = emailShell(`
    <div style="background:#ffffff;border-radius:16px;border:1px solid #a7f3d0;overflow:hidden;box-shadow:0 4px 24px rgba(5,150,105,0.08);">
      <div style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:20px 24px;">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Resort marketplace</p>
        <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;font-weight:700;color:#ffffff;">Your listing is approved</h1>
      </div>
      <div style="padding:24px 24px 8px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#134e4a;">Hi there,</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#134e4a;">
          Great news — we’ve reviewed and <strong style="color:#047857;">approved</strong> <strong style="color:#065f46;">${name}</strong>.
          You can now use the same Google account you registered with to open your resort admin: add rooms, track bookings, and keep your listing up to date.
        </p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
          <tr>
            <td style="border-radius:999px;background:#059669;">
              <a href="${adminUrl}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Open your resort admin</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#6b7280;">
          Button not working? Paste this link into your browser:<br/>
          <a href="${adminUrl}" style="color:#059669;word-break:break-all;">${adminUrl}</a>
        </p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#134e4a;">
          Your resort can appear on the marketplace for guests to discover. If you’d like to double-check how things look from a guest’s perspective, you can always visit the marketplace anytime.
        </p>
        <p style="margin:0 0 24px;font-size:13px;">
          <a href="${marketplaceUrl}" style="color:#059669;font-weight:600;text-decoration:underline;">Browse the marketplace</a>
        </p>
      </div>
      <div style="padding:16px 24px 20px;border-top:1px solid #d1fae5;background:#f0fdf4;">
        <p style="margin:0;font-size:11px;line-height:1.5;color:#6b7280;">
          This message was sent automatically because your resort registration was approved. Replies to this email may not be monitored — for questions, use the contact options on the marketplace site if available.
        </p>
      </div>
    </div>
  `)
  const text = [
    `Resort Marketplace — your listing is approved`,
    ``,
    `Hi there,`,
    ``,
    `We've approved "${resortName}". You can sign in with Google and open your resort admin to manage rooms and bookings:`,
    adminUrl,
    ``,
    `Marketplace: ${marketplaceUrl}`,
    ``,
    `This email was sent automatically.`,
  ].join("\n")
  return { subject, html, text }
}

function buildRejectedEmail({ resortName, reason, marketplaceUrl }) {
  const name = escapeHtml(resortName)
  const reasonBlock = reason
    ? `<div style="margin:20px 0;padding:16px 18px;border-radius:12px;border-left:4px solid #f87171;background:#fef2f2;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b91c1c;">Note from the reviewer</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#450a0a;white-space:pre-wrap;">${escapeHtml(reason).replace(/\n/g, "<br/>")}</p>
      </div>`
    : `<p style="margin:16px 0;font-size:14px;line-height:1.6;color:#57534e;">We weren’t able to share a detailed note this time. If something was unclear, you’re welcome to update your listing and try again.</p>`

  const subject = `Update on your listing: ${resortName}`
  const html = emailShell(`
    <div style="background:#ffffff;border-radius:16px;border:1px solid #fecaca;overflow:hidden;box-shadow:0 4px 24px rgba(185,28,28,0.06);">
      <div style="background:linear-gradient(135deg,#fef2f2 0%,#fff7ed 100%);padding:20px 24px;border-bottom:1px solid #fecaca;">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#b45309;">Resort marketplace</p>
        <h1 style="margin:8px 0 0;font-size:21px;line-height:1.3;font-weight:700;color:#7f1d1d;">We couldn’t approve this listing yet</h1>
      </div>
      <div style="padding:24px 24px 8px;">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#44403c;">Hi there,</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#44403c;">
          Thank you for submitting <strong style="color:#1c1917;">${name}</strong>. After review, we’re not able to approve it <em>for now</em> — this isn’t necessarily permanent.
        </p>
        ${reasonBlock}
        <p style="margin:20px 0 8px;font-size:14px;font-weight:700;color:#134e4a;">What you can do next</p>
        <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.65;color:#44403c;">
          <li style="margin-bottom:8px;">Read the note above (if any) and adjust your resort name, location, map link, or description.</li>
          <li style="margin-bottom:8px;">Open the marketplace partner form, update your details, and submit again for review.</li>
        </ol>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;">
          <tr>
            <td style="border-radius:999px;border:2px solid #059669;">
              <a href="${marketplaceUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#059669;text-decoration:none;border-radius:999px;">Update &amp; resubmit on the marketplace</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#6b7280;">
          Link: <a href="${marketplaceUrl}" style="color:#059669;word-break:break-all;">${marketplaceUrl}</a>
        </p>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#57534e;">We appreciate you taking the time to register. A clearer map link or more complete details often helps the next review go smoothly.</p>
      </div>
      <div style="padding:16px 24px 20px;border-top:1px solid #fee2e2;background:#fffbeb;">
        <p style="margin:0;font-size:11px;line-height:1.5;color:#78716c;">
          This message was sent automatically when your listing status was updated. Replies may not be monitored.
        </p>
      </div>
    </div>
  `)
  const textLines = [
    `Resort Marketplace — listing not approved (for now)`,
    ``,
    `Hi there,`,
    ``,
    `We reviewed "${resortName}" and we're not able to approve it at this time.`,
    ...(reason ? ["", "Note from reviewer:", reason, ""] : ["", ""]),
    `What you can do:`,
    `- Update your details on the marketplace and submit again.`,
    ``,
    marketplaceUrl,
    ``,
    `This email was sent automatically.`,
  ]
  const text = textLines.join("\n")
  return { subject, html, text }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const type = String(body.type || "").toLowerCase()
    let to = String(body.to || "").trim().toLowerCase()
    const resortName = String(body.resortName || "Your resort").trim()
    const reason = String(body.reason || "").trim()
    const idToken = String(body.idToken || "").trim()

    if (type !== "approved" && type !== "rejected") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 })
    }
    if (!to) {
      return NextResponse.json({ error: "Recipient email is required" }, { status: 400 })
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    const resolved = await resolveResortNotifySmtpCredentials({ idToken })
    const creds = resolved.creds
    if (!creds) {
      return NextResponse.json(
        {
          error: "Email service not configured",
          skipped: true,
          skipReason: resolved.skipReason,
          hint: resolved.hint,
        },
        { status: 503 },
      )
    }

    let transporter
    try {
      transporter = await getGmailTransporterForSend(creds.user, creds.pass)
    } catch (verifyErr) {
      console.error("notify-status Gmail verify:", verifyErr)
      return smtpFailureResponse(verifyErr, creds)
    }

    const sender = creds.user.trim()
    const from = `"${getResortAdminMailDisplayName()}" <${sender}>`
    const replyTo = (creds.replyTo || sender).trim()
    const baseUrl = getPublicBaseUrl()
    const adminUrl = `${baseUrl}/admin`
    const marketplaceUrl = `${baseUrl}/resorts`

    if (type === "approved") {
      const { subject, html, text } = buildApprovedEmail({ resortName, adminUrl, marketplaceUrl })
      try {
        await transporter.sendMail({
          from,
          to,
          replyTo,
          subject,
          html,
          text,
        })
      } catch (sendErr) {
        console.error("notify-status sendMail (approved):", sendErr)
        return smtpFailureResponse(sendErr, creds)
      }
      return NextResponse.json({ success: true, mailSource: creds.source })
    }

    const { subject, html, text } = buildRejectedEmail({ resortName, reason, marketplaceUrl })
    try {
      await transporter.sendMail({
        from,
        to,
        replyTo,
        subject,
        html,
        text,
      })
    } catch (sendErr) {
      console.error("notify-status sendMail (rejected):", sendErr)
      return smtpFailureResponse(sendErr, creds)
    }
    return NextResponse.json({ success: true, mailSource: creds.source })
  } catch (error) {
    console.error("notify-status email error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send email" },
      { status: 500 },
    )
  }
}
