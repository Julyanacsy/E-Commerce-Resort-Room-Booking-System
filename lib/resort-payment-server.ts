/**
 * Server-only: resolve PayMongo / Xendit credentials per resort owner.
 * Reads resortOwners/{ownerUid}/secrets/payment via Firebase Admin when configured.
 */
import { getAdminFirestore } from "@/lib/firebase-admin"

export type PaymentProvider = "none" | "paymongo" | "xendit"

export type ResortPaymentSecrets = {
  provider?: string
  paymongoSecretKey?: string
  paymongoWebhookSecret?: string
  xenditSecretKey?: string
  xenditWebhookToken?: string
}

function normalizeProvider(v: unknown): PaymentProvider {
  const s = String(v || "").trim().toLowerCase()
  if (s === "paymongo") return "paymongo"
  if (s === "xendit") return "xendit"
  if (s === "none") return "none"
  return "none"
}

export async function fetchResortPaymentSecrets(ownerUid: string | null): Promise<ResortPaymentSecrets | null> {
  const db = getAdminFirestore()
  if (!db || !ownerUid) return null
  const snap = await db.doc(`resortOwners/${ownerUid}/secrets/payment`).get()
  if (!snap.exists) return null
  return snap.data() as ResortPaymentSecrets
}

export type ResolvedPayment = {
  provider: PaymentProvider
  paymongoSecretKey: string
  paymongoWebhookSecret: string
  xenditSecretKey: string
  xenditWebhookToken: string
}

/**
 * Effective provider + keys. Legacy: no Firestore doc → PayMongo if `PAYMONGO_SECRET_KEY` in env.
 * Explicit `provider: none` in Firestore disables links even when env keys exist.
 */
export async function resolvePaymentForBooking(ownerUid: string | null): Promise<ResolvedPayment> {
  const sec = await fetchResortPaymentSecrets(ownerUid)
  const envSk = process.env.PAYMONGO_SECRET_KEY?.trim() || ""
  const envWh = process.env.PAYMONGO_WEBHOOK_SECRET?.trim() || ""

  const paymongoSk = (sec?.paymongoSecretKey?.trim() || "") || envSk
  const paymongoWh = (sec?.paymongoWebhookSecret?.trim() || "") || envWh
  const xenditSk = sec?.xenditSecretKey?.trim() || ""
  const xenditWh = sec?.xenditWebhookToken?.trim() || ""

  if (sec && normalizeProvider(sec.provider) === "none") {
    return {
      provider: "none",
      paymongoSecretKey: paymongoSk,
      paymongoWebhookSecret: paymongoWh,
      xenditSecretKey: xenditSk,
      xenditWebhookToken: xenditWh,
    }
  }

  const requested = sec ? normalizeProvider(sec.provider) : "none"

  if (requested === "xendit" && xenditSk) {
    return { provider: "xendit", paymongoSecretKey: paymongoSk, paymongoWebhookSecret: paymongoWh, xenditSecretKey: xenditSk, xenditWebhookToken: xenditWh }
  }
  if (requested === "paymongo" && paymongoSk) {
    return { provider: "paymongo", paymongoSecretKey: paymongoSk, paymongoWebhookSecret: paymongoWh, xenditSecretKey: xenditSk, xenditWebhookToken: xenditWh }
  }

  // No doc or empty provider: keep PayMongo env fallback for backwards compatibility
  if (!sec && envSk) {
    return { provider: "paymongo", paymongoSecretKey: envSk, paymongoWebhookSecret: envWh, xenditSecretKey: "", xenditWebhookToken: "" }
  }

  if (requested === "paymongo" && !paymongoSk) {
    return { provider: "none", paymongoSecretKey: "", paymongoWebhookSecret: paymongoWh, xenditSecretKey: xenditSk, xenditWebhookToken: xenditWh }
  }
  if (requested === "xendit" && !xenditSk) {
    return { provider: "none", paymongoSecretKey: paymongoSk, paymongoWebhookSecret: paymongoWh, xenditSecretKey: "", xenditWebhookToken: xenditWh }
  }

  return { provider: "none", paymongoSecretKey: paymongoSk, paymongoWebhookSecret: paymongoWh, xenditSecretKey: xenditSk, xenditWebhookToken: xenditWh }
}

export async function resolvePaymongoWebhookSecretForBooking(ownerUid: string | null): Promise<string> {
  const r = await resolvePaymentForBooking(ownerUid)
  return r.paymongoWebhookSecret || process.env.PAYMONGO_WEBHOOK_SECRET?.trim() || ""
}

export async function createPaymongoPaymentLink(opts: {
  secretKey: string
  amountPhp: number
  bookingId: string
  description: string
}): Promise<{ checkoutUrl: string; linkId: string } | { error: string; status?: number }> {
  const sk = opts.secretKey.trim()
  if (!sk.startsWith("sk_")) {
    return { error: "Invalid PayMongo secret key format" }
  }
  const amountInCentavos = Math.round(opts.amountPhp * 100)
  const authString = Buffer.from(`${sk}:`).toString("base64")
  const paymongoResponse = await fetch("https://api.paymongo.com/v1/links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${authString}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: amountInCentavos,
          currency: "PHP",
          description: opts.description,
          remarks: `Booking ID: ${opts.bookingId}`,
        },
      },
    }),
  })
  const paymongoData = await paymongoResponse.json()
  if (!paymongoResponse.ok || !paymongoData.data?.attributes?.checkout_url) {
    return {
      error: JSON.stringify(paymongoData.errors || paymongoData),
      status: paymongoResponse.status,
    }
  }
  return {
    checkoutUrl: paymongoData.data.attributes.checkout_url,
    linkId: paymongoData.data.id,
  }
}

export async function createXenditInvoiceLink(opts: {
  secretKey: string
  amountPhp: number
  bookingId: string
  description: string
  payerEmail?: string
}): Promise<{ invoiceUrl: string; invoiceId: string } | { error: string; status?: number }> {
  const sk = opts.secretKey.trim()
  if (!sk) return { error: "Missing Xendit secret key" }
  const authString = Buffer.from(`${sk}:`).toString("base64")
  const externalId = `booking-${opts.bookingId}-${Date.now()}`
  const body: Record<string, unknown> = {
    external_id: externalId,
    amount: opts.amountPhp,
    currency: "PHP",
    description: opts.description.slice(0, 1000),
    metadata: { booking_id: opts.bookingId },
  }
  if (opts.payerEmail?.trim()) body.payer_email = opts.payerEmail.trim()

  const res = await fetch("https://api.xendit.co/v2/invoices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${authString}`,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { invoice_url?: string; id?: string; message?: string }
  if (!res.ok || !data.invoice_url || !data.id) {
    return { error: data.message || JSON.stringify(data), status: res.status }
  }
  return { invoiceUrl: data.invoice_url, invoiceId: data.id }
}
