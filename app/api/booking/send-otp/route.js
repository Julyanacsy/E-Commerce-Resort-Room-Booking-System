import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import {
  getBookingDb,
  normalizeOwnerUid,
  verifyRecaptchaToken,
} from "@/lib/booking-api-server"
import { generateOtp, removeOtp, storeOtp } from "@/lib/otp-store"

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 })
  }

  const email = String(body?.email || "").trim().toLowerCase()
  const ownerUid = normalizeOwnerUid(body?.ownerUid)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ error: "A valid email address is required." }, { status: 400 })
  }

  try {
    const captcha = await verifyRecaptchaToken(body?.recaptchaToken)
    if (!captcha.ok) {
      return Response.json({ error: captcha.error }, { status: captcha.status })
    }
  } catch (error) {
    console.error("reCAPTCHA verification request failed:", error)
    return Response.json({ error: "Unable to verify reCAPTCHA." }, { status: 502 })
  }

  const db = getBookingDb()
  if (!db) {
    return Response.json({ error: "Firebase Admin credentials are not configured." }, { status: 503 })
  }

  const otp = generateOtp()
  try {
    const stored = await storeOtp(db, { email, ownerUid, otp })
    if (!stored.ok) {
      return Response.json(
        { error: "Please wait before requesting another OTP.", retryAfterSeconds: stored.retryAfterSeconds },
        { status: 429 },
      )
    }
  } catch (error) {
    console.error("Failed to store booking OTP:", error)
    return Response.json({ error: error.message || "OTP service is not configured." }, { status: 503 })
  }

  try {
    const mail = await resolveCentralEnvMail()
    if (!mail.ok) {
      try {
        await removeOtp(db, { email, ownerUid })
      } catch (cleanupError) {
        console.error("Failed to remove unsent booking OTP:", cleanupError)
      }
      console.error("Booking OTP email is unavailable:", mail.code, mail.message)
      return Response.json({ error: "Booking email is not configured. Please contact the resort." }, { status: 503 })
    }

    await mail.transporter.sendMail({
      from: `"${mail.brandName}" <${mail.user}>`,
      to: email,
      replyTo: mail.replyTo,
      subject: "Your booking verification code",
      text: `Your verification code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937"><h2>Verify your booking</h2><p>Enter this code to continue:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
    })
    return Response.json({ success: true, message: "OTP sent successfully." })
  } catch (error) {
    console.error("Failed to send booking OTP:", error)
    try {
      await removeOtp(db, { email, ownerUid })
    } catch (cleanupError) {
      console.error("Failed to remove unsent booking OTP:", cleanupError)
    }
    return Response.json({ error: "Could not send the verification email. Please try again." }, { status: 502 })
  }
}