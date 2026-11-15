import { getBookingDb, jsonFailure } from "@/lib/booking-api-server"
import { resolveResortPaymentSettings } from "@/lib/resort-payment-settings.mjs"

export async function GET(request) {
  const ownerUid = String(new URL(request.url).searchParams.get("ownerUid") || "").trim()
  if (!ownerUid || ownerUid.length > 128 || ownerUid.includes("/")) {
    return jsonFailure("A valid resort owner is required.", 400)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const ownerSnapshot = await db.collection("resortOwners").doc(ownerUid).get()
    if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").trim().toLowerCase() !== "approved") {
      return Response.json(
        { ...resolveResortPaymentSettings() },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    const owner = ownerSnapshot.data() || {}
    const legacySnapshot = await db
      .collection("resortOwners")
      .doc(ownerUid)
      .collection("site")
      .doc("payment")
      .get()
    const legacy = legacySnapshot.exists ? legacySnapshot.data() || {} : {}
    return Response.json(
      resolveResortPaymentSettings(owner, legacy),
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to load public resort payment settings:", error)
    return jsonFailure("Payment settings could not be loaded.", 500)
  }
}
