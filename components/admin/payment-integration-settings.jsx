"use client"

import { useEffect, useState } from "react"
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import {
  MAX_GCASH_QR_DATA_URL_CHARS,
  readFileAsDataURL,
} from "@/lib/data-url-files"
import { toast } from "sonner"

const PAYMENT_DOC_ID = "payment"

export default function PaymentIntegrationSettings({ tenantOwnerUid, isLegacyHelpdesk }) {
  const [provider, setProvider] = useState("paymongo")
  const [paymongoSk, setPaymongoSk] = useState("")
  const [paymongoWh, setPaymongoWh] = useState("")
  const [xenditSk, setXenditSk] = useState("")
  const [xenditWh, setXenditWh] = useState("")
  const [hasPaymongoSk, setHasPaymongoSk] = useState(false)
  const [hasPaymongoWh, setHasPaymongoWh] = useState(false)
  const [hasXenditSk, setHasXenditSk] = useState(false)
  const [hasXenditWh, setHasXenditWh] = useState(false)
  const [saving, setSaving] = useState(false)

  const [ownerApproved, setOwnerApproved] = useState(false)
  const [qrUrl, setQrUrl] = useState("")
  const [qrUploading, setQrUploading] = useState(false)
  const [instructions, setInstructions] = useState("")

  useEffect(() => {
    if (!db || !tenantOwnerUid || isLegacyHelpdesk) return undefined
    const ref = doc(db, "resortOwners", tenantOwnerUid, "secrets", PAYMENT_DOC_ID)
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setProvider("paymongo")
        setHasPaymongoSk(false)
        setHasPaymongoWh(false)
        setHasXenditSk(false)
        setHasXenditWh(false)
        return
      }
      const d = snap.data() || {}
      const p = String(d.provider || "").toLowerCase()
      setProvider(p === "xendit" ? "xendit" : p === "none" ? "none" : "paymongo")
      setHasPaymongoSk(Boolean(String(d.paymongoSecretKey || "").trim()))
      setHasPaymongoWh(Boolean(String(d.paymongoWebhookSecret || "").trim()))
      setHasXenditSk(Boolean(String(d.xenditSecretKey || "").trim()))
      setHasXenditWh(Boolean(String(d.xenditWebhookToken || "").trim()))
    })
  }, [tenantOwnerUid, isLegacyHelpdesk])

  useEffect(() => {
    if (!db || !tenantOwnerUid || isLegacyHelpdesk) return undefined
    const unsubOwner = onSnapshot(doc(db, "resortOwners", tenantOwnerUid), (snap) => {
      const status = String(snap.data()?.status || "").trim().toLowerCase()
      setOwnerApproved(status === "approved")
    })
    const unsubPayment = onSnapshot(doc(db, "resortOwners", tenantOwnerUid, "site", PAYMENT_DOC_ID), (snap) => {
      const d = snap.exists() ? snap.data() : {}
      setQrUrl(String(d?.gcashQrUrl || "").trim())
      setInstructions(String(d?.instructions || "").trim())
    })
    return () => {
      unsubOwner()
      unsubPayment()
    }
  }, [tenantOwnerUid, isLegacyHelpdesk])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!db || !tenantOwnerUid) return
    setSaving(true)
    try {
      const payload = {
        provider,
        updatedAt: serverTimestamp(),
      }
      if (paymongoSk.trim()) payload.paymongoSecretKey = paymongoSk.trim()
      if (paymongoWh.trim()) payload.paymongoWebhookSecret = paymongoWh.trim()
      if (xenditSk.trim()) payload.xenditSecretKey = xenditSk.trim()
      if (xenditWh.trim()) payload.xenditWebhookToken = xenditWh.trim()

      await setDoc(doc(db, "resortOwners", tenantOwnerUid, "secrets", PAYMENT_DOC_ID), payload, { merge: true })
      setPaymongoSk("")
      setPaymongoWh("")
      setXenditSk("")
      setXenditWh("")
      toast.success("Payment settings saved.")
    } catch (err) {
      console.error(err)
      toast.error(err?.message || "Failed to save payment settings.")
    } finally {
      setSaving(false)
    }
  }

  if (isLegacyHelpdesk || !tenantOwnerUid) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-4">Payment integration</h1>
        <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
          This helpdesk account uses the <strong>global</strong> PayMongo keys from server environment variables (
          <span className="font-mono text-xs">PAYMONGO_SECRET_KEY</span>,{" "}
          <span className="font-mono text-xs">PAYMONGO_WEBHOOK_SECRET</span>). Approved resort owners configure
          PayMongo or Xendit under their own admin account.
        </p>
      </div>
    )
  }

  const handleQrUpload = async (file) => {
    if (!tenantOwnerUid || !db) return
    if (!ownerApproved) {
      toast.error("Your account must be approved before you can publish a QR code.")
      return
    }
    setQrUploading(true)
    try {
      const dataUrl = await readFileAsDataURL(file)
      if (dataUrl.length > MAX_GCASH_QR_DATA_URL_CHARS) {
        toast.error("QR image is too large for Firestore. Use a smaller PNG/JPG (about 300 KB or less).")
        return
      }
      await setDoc(
        doc(db, "resortOwners", tenantOwnerUid, "site", PAYMENT_DOC_ID),
        {
          gcashQrUrl: dataUrl,
          instructions: instructions || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setQrUrl(dataUrl)
      toast.success("GCash QR code saved to Firestore.")
    } catch (err) {
      console.error(err)
      toast.error(err?.message || "Failed to save QR code.")
    } finally {
      setQrUploading(false)
    }
  }

  const handleSaveInstructions = async () => {
    if (!db || !tenantOwnerUid) return
    try {
      await setDoc(
        doc(db, "resortOwners", tenantOwnerUid, "site", PAYMENT_DOC_ID),
        { instructions: instructions || "", updatedAt: serverTimestamp() },
        { merge: true },
      )
      toast.success("Payment instructions saved.")
    } catch (err) {
      console.error(err)
      toast.error(err?.message || "Failed to save instructions.")
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-foreground mb-2">Payment</h1>
      <p className="mb-8 max-w-2xl text-sm text-muted-foreground leading-relaxed">
        Upload your <strong>GCash QR code</strong> so guests can pay after they complete the booking form. Guests will
        also upload <strong>proof of payment</strong> and <strong>1 valid ID</strong> before OTP confirmation.
      </p>

      <div className="max-w-2xl space-y-6 rounded-xl bg-card p-6 shadow-lg border border-border">
        {!ownerApproved && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your resort account is not approved yet. Once approved, you can upload your GCash QR code here.
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">GCash QR code</p>
          {qrUrl ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <img src={qrUrl} alt="GCash QR code" className="h-44 w-44 rounded-lg border border-border bg-white object-contain" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Live on guest booking form.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {qrUrl.startsWith("data:")
                    ? "Stored in Firestore (embedded image)."
                    : `URL: ${qrUrl}`}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No QR uploaded yet.</p>
          )}

          <input
            type="file"
            accept="image/*"
            disabled={qrUploading || !ownerApproved}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleQrUpload(f)
              e.target.value = ""
            }}
            className="block w-full text-sm"
          />
          <p className="text-xs text-muted-foreground">PNG/JPG recommended. Keep it clear and high-contrast.</p>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <label className="block text-sm font-semibold text-foreground">Payment instructions (optional)</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground"
            placeholder="e.g. Send screenshot of payment + 1 valid ID. Processing time: 5–15 minutes."
          />
          <button
            type="button"
            onClick={handleSaveInstructions}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Save instructions
          </button>
        </div>
      </div>
    </div>
  )
}
