import { getBookingDb, jsonFailure } from "@/lib/booking-api-server"

export async function GET(request) {
  const ownerUid = String(new URL(request.url).searchParams.get("ownerUid") || "").trim()
  if (!ownerUid || ownerUid.length > 128 || ownerUid.includes("/")) {
    return jsonFailure("A valid resort owner is required.", 400)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const ownerSnapshot = await db.collection("resortOwners").doc(ownerUid).get()
    if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved") {
      return Response.json(
        { gcashQrImage: "", paymentInstructions: "" },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    const owner = ownerSnapshot.data() || {}
    const hasOwnerPaymentSettings =
      Object.prototype.hasOwnProperty.call(owner, "gcashQrImage") ||
      Object.prototype.hasOwnProperty.call(owner, "paymentInstructions")
    if (hasOwnerPaymentSettings) {
      return Response.json(
        {
          gcashQrImage: String(owner.gcashQrImage || ""),
          paymentInstructions: String(owner.paymentInstructions || ""),
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    const legacySnapshot = await db
      .collection("resortOwners")
      .doc(ownerUid)
      .collection("site")
      .doc("payment")
      .get()
    const legacy = legacySnapshot.exists ? legacySnapshot.data() || {} : {}
    return Response.json(
      {
        gcashQrImage: String(legacy.gcashQrUrl || ""),
        paymentInstructions: String(legacy.instructions || ""),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to load public resort payment settings:", error)
    return jsonFailure("Payment settings could not be loaded.", 500)
  }
}
