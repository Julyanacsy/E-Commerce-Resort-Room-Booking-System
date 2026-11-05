import { NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore"
import { normalizeOwnerUid } from "@/lib/booking-tenant"
import { fetchResortPaymentSecrets } from "@/lib/resort-payment-server"

/**
 * Xendit invoice callbacks. Configure your Xendit webhook URL to this route.
 * Verifies x-callback-token against resortOwners payment doc (xenditWebhookToken field).
 */
export async function POST(request) {
  try {
    const token = request.headers.get("x-callback-token") || request.headers.get("X-Callback-Token") || ""
    const body = await request.json()
    const bookingId =
      (body.metadata && body.metadata.booking_id) || body.metadata?.bookingId || body.booking_id || null

    if (!bookingId) {
      return NextResponse.json({ error: "Missing booking reference" }, { status: 400 })
    }

    const bookingRef = doc(db, "guestbooking", bookingId)
    const bookingSnap = await getDoc(bookingRef)
    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    const ownerUid = normalizeOwnerUid(bookingSnap.data()?.ownerUid)
    const secrets = await fetchResortPaymentSecrets(ownerUid)
    const expected = secrets?.xenditWebhookToken?.trim()

    if (!expected || token !== expected) {
      console.error("Xendit webhook: invalid or missing callback token")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const status = String(body.status || "").toUpperCase()
    if (status === "PAID" || status === "SETTLED" || status === "COMPLETED") {
      const amount = typeof body.amount === "number" ? body.amount : Number(body.amount || 0)
      await updateDoc(bookingRef, {
        paymentStatus: "paid",
        paymentId: body.id || "",
        paymentProvider: "xendit",
        paidAmount: amount,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return NextResponse.json({ success: true, bookingId })
    }

    return NextResponse.json({ message: "Ignored status", status })
  } catch (e) {
    console.error("xendit-webhook:", e)
    return NextResponse.json({ error: e.message || "Webhook error" }, { status: 500 })
  }
}
