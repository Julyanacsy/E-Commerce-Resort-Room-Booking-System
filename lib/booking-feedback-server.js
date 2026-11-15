import {
  createBookingFeedbackToken,
  FEEDBACK_TOKEN_TTL_DAYS,
  hashBookingFeedbackToken,
} from "@/lib/booking-feedback.mjs"

export async function issueBookingFeedbackToken(db, bookingRef) {
  const token = createBookingFeedbackToken()
  const tokenHash = hashBookingFeedbackToken(token)
  const tokenRef = db.collection("bookingFeedbackTokens").doc(tokenHash)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + FEEDBACK_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  let issued = false

  await db.runTransaction(async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef)
    if (
      !bookingSnapshot.exists
      || !["Approved", "Completed"].includes(String(bookingSnapshot.get("status") || ""))
      || bookingSnapshot.get("stayStatus") !== "checked_out"
      || bookingSnapshot.get("feedbackSubmittedAt")
    ) return

    transaction.create(tokenRef, {
      bookingId: bookingRef.id,
      ownerUid: String(bookingSnapshot.get("ownerUid") || ""),
      createdAt: now,
      expiresAt,
    })
    transaction.update(bookingRef, {
      feedbackTokenHash: tokenHash,
      feedbackInvitedAt: now,
    })
    issued = true
  })

  return issued ? token : ""
}

export function getPublicAppUrl(request) {
  const configuredUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim()
  const fallbackUrl = new URL(request.url).origin
  const parsed = new URL(configuredUrl || fallbackUrl)
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("The public application URL must use HTTP or HTTPS.")
  }
  return parsed.origin
}
