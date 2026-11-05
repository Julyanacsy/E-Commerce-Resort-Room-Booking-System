import crypto from "node:crypto"

const OTP_COLLECTION = "bookingOtpChallenges"
const OTP_LIFETIME_MS = 10 * 60 * 1000
const RESEND_DELAY_MS = 60 * 1000
const MAX_ATTEMPTS = 5

function getOtpSecret() {
  const secret = String(process.env.OTP_SECRET || "").trim()
  if (!secret) throw new Error("OTP_SECRET is not configured.")
  return secret
}

function challengeId(email, ownerUid) {
  return crypto
    .createHmac("sha256", getOtpSecret())
    .update(`${email}\n${ownerUid || ""}`)
    .digest("hex")
}

function otpHash(email, ownerUid, otp) {
  return crypto
    .createHmac("sha256", getOtpSecret())
    .update(`${email}\n${ownerUid || ""}\n${otp}`)
    .digest("hex")
}

export function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")
}

export async function storeOtp(db, { email, ownerUid, otp }) {
  const ref = db.collection(OTP_COLLECTION).doc(challengeId(email, ownerUid))
  const now = Date.now()
  const hash = otpHash(email, ownerUid, otp)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const lastSentAt = snapshot.exists ? snapshot.get("sentAt")?.toMillis?.() || 0 : 0
    if (lastSentAt && now - lastSentAt < RESEND_DELAY_MS) {
      return { ok: false, retryAfterSeconds: Math.ceil((RESEND_DELAY_MS - (now - lastSentAt)) / 1000) }
    }

    transaction.set(ref, {
      email,
      ownerUid: ownerUid || null,
      codeHash: hash,
      sentAt: new Date(now),
      expiresAt: new Date(now + OTP_LIFETIME_MS),
      attempts: 0,
    })
    return { ok: true }
  })
}

export async function removeOtp(db, { email, ownerUid }) {
  await db.collection(OTP_COLLECTION).doc(challengeId(email, ownerUid)).delete()
}

export async function verifyOtpInTransaction(transaction, db, { email, ownerUid, otp }) {
  const ref = db.collection(OTP_COLLECTION).doc(challengeId(email, ownerUid))
  const candidateHash = Buffer.from(otpHash(email, ownerUid, otp), "hex")
  const snapshot = await transaction.get(ref)
  if (!snapshot.exists) return { ok: false, reason: "missing" }

  const data = snapshot.data() || {}
  const expiresAt = data.expiresAt?.toMillis?.()
  if (!expiresAt || expiresAt <= Date.now()) {
    transaction.delete(ref)
    return { ok: false, reason: "expired" }
  }
  if (Number(data.attempts || 0) >= MAX_ATTEMPTS) {
    transaction.delete(ref)
    return { ok: false, reason: "locked" }
  }

  const storedHash = Buffer.from(String(data.codeHash || ""), "hex")
  const matches =
    storedHash.length === candidateHash.length &&
    crypto.timingSafeEqual(storedHash, candidateHash)
  if (!matches) {
    transaction.update(ref, { attempts: Number(data.attempts || 0) + 1 })
    return { ok: false, reason: "invalid" }
  }

  return { ok: true, ref }
}
