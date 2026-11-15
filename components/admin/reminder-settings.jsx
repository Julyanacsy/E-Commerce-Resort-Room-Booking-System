"use client"

import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { toast } from "sonner"
import { db } from "@/lib/firebase"
import { resortAdminRequest } from "@/lib/admin-api-client"
import { resolveResortGuestInfo } from "@/lib/kamayan-guest-info.mjs"

export default function ReminderSettings({ ownerUid }) {
  const [instructions, setInstructions] = useState("")
  const [rules, setRules] = useState("")
  const [wifiNetworkName, setWifiNetworkName] = useState("")
  const [wifiPassword, setWifiPassword] = useState("")
  const [wifiVoucherCode, setWifiVoucherCode] = useState("")
  const [wifiInstructions, setWifiInstructions] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!db || !ownerUid) {
      setLoading(false)
      return undefined
    }
    let ownerSettings = {}
    let branding = {}
    let ownerLoaded = false
    let brandingLoaded = false
    const syncSettings = () => {
      if (!ownerLoaded || !brandingLoaded) return
      const guestInfo = resolveResortGuestInfo(branding)
      setInstructions(String(
        "checkInInstructions" in ownerSettings
          ? ownerSettings.checkInInstructions || ""
          : guestInfo.checkInInstructions,
      ))
      setRules(String(
        "resortRulesText" in ownerSettings
          ? ownerSettings.resortRulesText || ""
          : guestInfo.resortRulesText,
      ))
      setWifiNetworkName(String(ownerSettings.wifiNetworkName || ""))
      setWifiPassword(String(ownerSettings.wifiPassword || ""))
      setWifiVoucherCode(String(ownerSettings.wifiVoucherCode || ""))
      setWifiInstructions(String(ownerSettings.wifiInstructions || ""))
      setLoading(false)
    }
    const unsubscribeOwner = onSnapshot(
      doc(db, "resortOwners", ownerUid),
      (snapshot) => {
        ownerSettings = snapshot.data() || {}
        ownerLoaded = true
        syncSettings()
      },
      (error) => {
        console.error("Failed to load reminder settings:", error)
        toast.error("Reminder settings could not be loaded.")
        ownerLoaded = true
        syncSettings()
      },
    )
    const unsubscribeBranding = onSnapshot(
      doc(db, "resortOwners", ownerUid, "site", "branding"),
      (snapshot) => {
        branding = snapshot.data() || {}
        brandingLoaded = true
        syncSettings()
      },
      (error) => {
        console.error("Failed to load resort branding for reminder defaults:", error)
        brandingLoaded = true
        syncSettings()
      },
    )
    return () => {
      unsubscribeOwner()
      unsubscribeBranding()
    }
  }, [ownerUid])

  const save = async () => {
    if (!db || !ownerUid) return
    setSaving(true)
    try {
      await resortAdminRequest("/api/resort/admin-mutations", {
        action: "reminder-settings.update",
        updates: {
          checkInInstructions: instructions.trim(),
          resortRulesText: rules.trim(),
          wifiNetworkName: wifiNetworkName.trim(),
          wifiPassword: wifiPassword.trim(),
          wifiVoucherCode: wifiVoucherCode.trim(),
          wifiInstructions: wifiInstructions.trim(),
        },
      })
      toast.success("Guest information and reminder settings saved.")
    } catch (error) {
      console.error("Failed to save reminder settings:", error)
      toast.error(error.message || "Check-in instructions could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-3xl font-bold text-foreground">Guest Information &amp; Reminders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Guests receive your resort rules when their booking is confirmed. The daily scheduled job sends reminders one day before check-in and checkout, then a one-time feedback link after verified checkout.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your resort's saved announcement, rates and fees, contacts, and amenities are included in guest confirmation and check-in emails. Edit those details in Brand Settings; leave any fields blank if they do not apply.
        </p>
      </header>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div>
          <label htmlFor="resort-rules" className="block text-sm font-semibold text-foreground">Rules and regulations</label>
          <textarea
            id="resort-rules"
            rows={6}
            maxLength={5000}
            value={rules}
            onChange={(event) => setRules(event.target.value)}
            disabled={loading || saving}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholder="Add your resort's house rules, quiet hours, visitor policy, and safety requirements."
          />
          <p className="mt-1 text-xs text-muted-foreground">Included in the booking confirmation email. Up to 5,000 characters.</p>
        </div>
        <div>
          <label htmlFor="check-in-instructions" className="block text-sm font-semibold text-foreground">Check-in instructions</label>
          <textarea
            id="check-in-instructions"
            rows={4}
            maxLength={2000}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            disabled={loading || saving}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholder="Add arrival time, directions, or what guests should bring."
          />
        </div>
        <div className="space-y-4 border-t border-border pt-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Guest Wi-Fi</h2>
            <p className="mt-1 text-sm text-muted-foreground">These details are shown only after a guest verifies a currently checked-in booking.</p>
          </div>
          <label className="block text-sm font-medium text-foreground">
            Network name (SSID)
            <input value={wifiNetworkName} onChange={(event) => setWifiNetworkName(event.target.value)} maxLength={120} disabled={loading || saving} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Wi-Fi password
            <input value={wifiPassword} onChange={(event) => setWifiPassword(event.target.value)} maxLength={200} disabled={loading || saving} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Wi-Fi voucher code (optional)
            <input value={wifiVoucherCode} onChange={(event) => setWifiVoucherCode(event.target.value)} maxLength={120} disabled={loading || saving} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Connection instructions (optional)
            <textarea value={wifiInstructions} onChange={(event) => setWifiInstructions(event.target.value)} rows={3} maxLength={1000} disabled={loading || saving} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" />
          </label>
        </div>
        <button type="button" onClick={save} disabled={loading || saving} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
          {saving ? "Saving…" : "Save guest information"}
        </button>
        <p className="text-xs text-muted-foreground">Email delivery uses the existing EMAIL_USER / EMAIL_PASSWORD setup. SMS is not enabled. The scheduled job also requires CRON_SECRET in production.</p>
      </div>
    </section>
  )
}
