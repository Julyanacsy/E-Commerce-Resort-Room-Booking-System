import { getBookingDb, getManilaDate } from "@/lib/booking-api-server"
import { canAccessGuestWifi } from "@/lib/booking-feedback.mjs"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 })
  }

  const ownerUid = String(body?.ownerUid || "").trim()
  const bookingId = String(body?.bookingId || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  if (
    !ownerUid
    || ownerUid.length > 128
    || !bookingId
    || bookingId.length > 128
    || bookingId.includes("/")
    || !EMAIL_PATTERN.test(email)
    || email.length > 254
  ) {
    return Response.json({ error: "Enter a valid booking reference and email address." }, { status: 400 })
  }

  const db = getBookingDb()
  if (!db) return Response.json({ error: "Guest access is temporarily unavailable." }, { status: 503 })

  try {
    const [bookingSnapshot, ownerSnapshot] = await Promise.all([
      db.collection("guestbooking").doc(bookingId).get(),
      db.collection("resortOwners").doc(ownerUid).get(),
    ])
    const booking = bookingSnapshot.exists ? bookingSnapshot.data() : null
    const owner = ownerSnapshot.exists ? ownerSnapshot.data() : null
    if (!canAccessGuestWifi(booking, owner, ownerUid, email, getManilaDate())) {
      return Response.json({ error: "Wi-Fi details are available only to the checked-in guest on this booking." }, { status: 403 })
    }

    return Response.json({
      success: true,
      wifi: {
        networkName: String(owner.wifiNetworkName || "").slice(0, 120),
        password: String(owner.wifiPassword || "").slice(0, 200),
        voucherCode: String(owner.wifiVoucherCode || "").slice(0, 120),
        instructions: String(owner.wifiInstructions || "").slice(0, 1000),
      },
    }, { headers: { "Cache-Control": "no-store, private" } })
  } catch (error) {
    console.error("Failed to load verified guest Wi-Fi details:", error)
    return Response.json({ error: "Wi-Fi details could not be loaded." }, { status: 500 })
  }
}
