"use client"

import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import {
  MAX_GCASH_QR_DATA_URL_CHARS,
  compressImageFileToDataUrl,
} from "@/lib/data-url-files"
import { toast } from "sonner"
import ManagePayments from "@/components/admin/manage-payments"
import { resortAdminRequest } from "@/lib/admin-api-client"
import { resolveResortPaymentSettings } from "@/lib/resort-payment-settings.mjs"

export default function PaymentSettings({ tenantOwnerUid, isLegacyHelpdesk, staffRole = "owner" }) {
  const [ownerApproved, setOwnerApproved] = useState(false)
  const [qrImage, setQrImage] = useState("")
  const [instructions, setInstructions] = useState("")
  const [reservationDepositPercent, setReservationDepositPercent] = useState(30)
  const [rootSettingsLoaded, setRootSettingsLoaded] = useState(false)
  const [legacySettingsLoaded, setLegacySettingsLoaded] = useState(false)
  const [qrUploading, setQrUploading] = useState(false)
  const [instructionsSaving, setInstructionsSaving] = useState(false)

  useEffect(() => {
    if (!db || !tenantOwnerUid || isLegacyHelpdesk || staffRole !== "owner") return undefined

    let owner = {}
    let legacy = {}
    let ownerSnapshotLoaded = false
    let legacySnapshotLoaded = false
    const syncSettings = () => {
      if (!ownerSnapshotLoaded || !legacySnapshotLoaded) return
      const settings = resolveResortPaymentSettings(owner, legacy)
      setQrImage(settings.gcashQrImage)
      setInstructions(settings.paymentInstructions)
      setReservationDepositPercent(settings.reservationDepositPercent)
      setRootSettingsLoaded(true)
      setLegacySettingsLoaded(true)
    }
    const ownerRef = doc(db, "resortOwners", tenantOwnerUid)
    const legacyPaymentRef = doc(db, "resortOwners", tenantOwnerUid, "site", "payment")
    const unsubscribeOwner = onSnapshot(
      ownerRef,
      (snapshot) => {
        owner = snapshot.data() || {}
        setOwnerApproved(String(owner.status || "").trim().toLowerCase() === "approved")
        ownerSnapshotLoaded = true
        syncSettings()
      },
      (error) => {
        console.error("Failed to load payment settings:", error)
        toast.error("Payment settings could not be loaded.")
      },
    )
    const unsubscribeLegacy = onSnapshot(
      legacyPaymentRef,
      (snapshot) => {
        legacy = snapshot.exists() ? snapshot.data() : {}
        legacySnapshotLoaded = true
        syncSettings()
      },
      (error) => {
        console.error("Failed to load legacy payment settings:", error)
        legacySnapshotLoaded = true
        syncSettings()
      },
    )

    return () => {
      unsubscribeOwner()
      unsubscribeLegacy()
    }
  }, [tenantOwnerUid, isLegacyHelpdesk, staffRole])

  if (isLegacyHelpdesk || !tenantOwnerUid) {
    return (
      <div>
        <h1 className="mb-4 text-3xl font-bold text-foreground">Payments</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Payments are handled manually through each resort owner&apos;s GCash QR code. There is no payment gateway.
        </p>
      </div>
    )
  }

  const savePaymentSettings = async (updates, setSaving) => {
    if (!db || !rootSettingsLoaded || !legacySettingsLoaded || !ownerApproved) {
      toast.error("Your resort must be approved before changing payment settings.")
      return false
    }
    const depositPercent = Number(updates.reservationDepositPercent ?? reservationDepositPercent)
    if (!Number.isInteger(depositPercent) || depositPercent < 1 || depositPercent > 100) {
      toast.error("Reservation deposit percentage must be a whole number from 1 to 100.")
      return false
    }
    setSaving(true)
    try {
      await resortAdminRequest("/api/resort/admin-mutations", {
        action: "payment-settings.update",
        updates: {
          gcashQrImage: updates.gcashQrImage ?? qrImage,
          paymentInstructions: updates.paymentInstructions ?? instructions,
          reservationDepositPercent: depositPercent,
        },
      })
      toast.success(
        updates.gcashQrImage
          ? "GCash QR code saved."
          : updates.reservationDepositPercent !== undefined
            ? "Reservation deposit percentage saved."
            : "Payment instructions saved.",
      )
      return true
    } catch (error) {
      console.error("Failed to save payment settings:", error)
      toast.error(error?.message || "Payment settings could not be saved.")
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleQrUpload = async (file) => {
    if (!file) return
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Choose a PNG or JPG image.")
      return
    }

    setQrUploading(true)
    try {
      const dataUrl = await compressImageFileToDataUrl(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.9,
        maxChars: MAX_GCASH_QR_DATA_URL_CHARS,
      })
      const saved = await savePaymentSettings({ gcashQrImage: dataUrl }, setQrUploading)
      if (saved) setQrImage(dataUrl)
    } catch (error) {
      console.error("Failed to upload GCash QR:", error)
      toast.error(error?.message || "GCash QR code could not be saved.")
      setQrUploading(false)
    }
  }

  if (tenantOwnerUid && staffRole !== "owner") {
    return <ManagePayments ownerUid={tenantOwnerUid} isLegacyHelpdesk={false} staffRole={staffRole} />
  }

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold text-foreground">Payments</h1>
      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Set the reservation deposit percentage and collect the remaining balance at check-in. Guests pay by GCash
        and upload the deposit proof plus one valid ID; staff can record the balance as cash or GCash when checking in.
      </p>

      <div className="max-w-3xl space-y-6 rounded-2xl border border-[#eee2d5] bg-white p-6 shadow-sm">
        {!ownerApproved && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your resort account is not approved yet. Once approved, you can configure manual GCash payments.
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">GCash QR code</p>
          {qrImage ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <img
                src={qrImage}
                alt="GCash QR code preview"
                className="h-44 w-44 rounded-lg border border-border bg-white object-contain"
              />
              <p className="text-sm font-medium text-foreground">Live on guest booking form</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No QR code uploaded yet.</p>
          )}

          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={qrUploading || !ownerApproved || !rootSettingsLoaded || !legacySettingsLoaded}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) handleQrUpload(file)
              event.target.value = ""
            }}
            className="block w-full text-sm"
          />
          <p className="text-xs text-muted-foreground">
            PNG or JPG. The image is compressed and stored in your owner document under 500 KB for Firestore.
          </p>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <label htmlFor="reservation-deposit-percent" className="block text-sm font-semibold text-foreground">
            Reservation deposit percentage
          </label>
          <p className="text-sm text-muted-foreground">
            Guests pay this percentage when booking. The remaining balance is collected and recorded during check-in.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="reservation-deposit-percent"
              type="number"
              min="1"
              max="100"
              step="1"
              required
              value={reservationDepositPercent}
              onChange={(event) => setReservationDepositPercent(event.target.value === "" ? "" : Number(event.target.value))}
              disabled={!ownerApproved}
              className="w-28 rounded-lg border border-border bg-background px-4 py-2 text-foreground"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <button
              type="button"
              onClick={() => savePaymentSettings({ reservationDepositPercent: Number(reservationDepositPercent) }, setInstructionsSaving)}
              disabled={
                instructionsSaving ||
                qrUploading ||
                !ownerApproved ||
                !rootSettingsLoaded ||
                !legacySettingsLoaded ||
                !Number.isInteger(Number(reservationDepositPercent)) ||
                Number(reservationDepositPercent) < 1 ||
                Number(reservationDepositPercent) > 100
              }
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {instructionsSaving ? "Saving…" : "Save deposit percentage"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Default is 30%. Enter a whole number from 1 to 100.</p>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <label htmlFor="payment-instructions" className="block text-sm font-semibold text-foreground">
            Payment instructions (optional)
          </label>
          <textarea
            id="payment-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={3}
            maxLength={1000}
            disabled={!ownerApproved}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground"
            placeholder="Send screenshot of reservation deposit + 1 valid ID. Processing time: 5-15 minutes."
          />
          <button
            type="button"
            onClick={() => savePaymentSettings({}, setInstructionsSaving)}
            disabled={
              instructionsSaving ||
              qrUploading ||
              !ownerApproved ||
              !rootSettingsLoaded ||
              !legacySettingsLoaded
            }
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {instructionsSaving ? "Saving…" : "Save instructions"}
          </button>
        </div>
      </div>
      <ManagePayments ownerUid={tenantOwnerUid} isLegacyHelpdesk={isLegacyHelpdesk} staffRole={staffRole} />
    </div>
  )
}
