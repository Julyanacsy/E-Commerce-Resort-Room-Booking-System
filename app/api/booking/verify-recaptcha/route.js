import { verifyRecaptchaToken } from "@/lib/booking-api-server"

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 })
  }

  try {
    const result = await verifyRecaptchaToken(body?.token)
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status })
    }
    return Response.json({ success: true, skipped: Boolean(result.skipped) })
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error)
    return Response.json({ error: "Unable to verify reCAPTCHA." }, { status: 502 })
  }
}