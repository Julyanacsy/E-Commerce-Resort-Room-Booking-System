import { getAccountFromIdToken } from "@/lib/firebase-id-token"
import { isAllowedSuperAdminEmail } from "@/lib/allowed-super-admins"
import { getEnvSmtpCredentials } from "@/lib/central-env-mail"

/**
 * Approve/reject resort emails: server mailbox from `.env` only.
 * Caller must pass a valid super-admin Firebase `idToken` (authorization).
 *
 * @returns {{ creds: object | null, skipReason?: string, hint?: string }}
 */
export async function resolveResortNotifySmtpCredentials(opts = {}) {
  const idToken = String(opts.idToken || "").trim()
  if (!idToken) {
    return {
      creds: null,
      skipReason: "missing_id_token",
      hint: "Walang Google session token — mag-sign in ulit gamit ang Google (Super Admin), tapos subukan ulit ang Approve.",
    }
  }

  const acct = await getAccountFromIdToken(idToken)
  if (!acct?.email) {
    return {
      creds: null,
      skipReason: "invalid_token",
      hint: "Hindi ma-verify ang Google sign-in. I-refresh ang page at mag-Connect with Google ulit.",
    }
  }

  if (!isAllowedSuperAdminEmail(acct.email)) {
    return {
      creds: null,
      skipReason: "not_super_admin",
      hint: `Ang naka-sign in (${acct.email}) ay wala sa super-admin allowlist. Dapat isa sa: commerceresortadmin / ecommerceresortadmin (tingnan lib/allowed-super-admins.js).`,
    }
  }

  const c = getEnvSmtpCredentials()
  if (!c) {
    const hasUser = !!(process.env.EMAIL_USER && String(process.env.EMAIL_USER).trim())
    const hasPass = !!(
      (process.env.EMAIL_PASSWORD && String(process.env.EMAIL_PASSWORD).trim()) ||
      (process.env.EMAIL_PASS && String(process.env.EMAIL_PASS).trim())
    )
    let hint =
      "Lagyan ng EMAIL_USER at EMAIL_PASS (o EMAIL_PASSWORD) ang `.env` sa root ng project (tabi ng package.json), tapos i-restart ang `npm run dev`."
    if (hasUser && !hasPass) hint = "May EMAIL_USER pero walang EMAIL_PASS / EMAIL_PASSWORD sa .env."
    if (!hasUser && hasPass) hint = "May password sa .env pero walang EMAIL_USER."
    return { creds: null, skipReason: "missing_env", hint }
  }

  return {
    creds: {
      user: c.user,
      pass: c.pass,
      replyTo: c.replyTo,
      service: "gmail",
      source: "env",
    },
    skipReason: null,
    hint: null,
  }
}
