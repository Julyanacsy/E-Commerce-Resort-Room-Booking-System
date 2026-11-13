"use client"

import { useEffect, useState } from "react"
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore"
import { toast } from "sonner"
import { db } from "@/lib/firebase"

export default function ReminderSettings({ ownerUid }) {
  const [instructions, setInstructions] = useState("")
  const [rules, setRules] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!db || !ownerUid) {
      setLoading(false)
      return undefined
    }
    return onSnapshot(
      doc(db, "resortOwners", ownerUid),
      (snapshot) => {
        const settings = snapshot.data() || {}
        setInstructions(String(settings.checkInInstructions || ""))
        setRules(String(settings.resortRulesText || ""))
        setLoading(false)
      },
      (error) => {
        console.error("Failed to load reminder settings:", error)
        toast.error("Reminder settings could not be loaded.")
        setLoading(false)
      },
    )
  }, [ownerUid])

  const save = async () => {
    if (!db || !ownerUid) return
    setSaving(true)
    try {
      await updateDoc(doc(db, "resortOwners", ownerUid), {
        checkInInstructions: instructions.trim(),
        resortRulesText: rules.trim(),
        updatedAt: serverTimestamp(),
      })
      toast.success("Guest email settings saved.")
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
        <h1 className="text-3xl font-bold text-foreground">Email Reminders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Booking confirmation emails include your resort rules. A daily scheduled email sends check-in and checkout reminders one day before each date.</p>
      </header>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <label htmlFor="resort-rules" className="block text-sm font-semibold text-foreground">
          Rules and regulations
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
        </label>
        <label htmlFor="check-in-instructions" className="block text-sm font-semibold text-foreground">Check-in instructions</label>
        <textarea
          id="check-in-instructions"
          rows={5}
          maxLength={2000}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          disabled={loading || saving}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          placeholder="Add arrival time, directions, or what guests should bring."
        />
        <button type="button" onClick={save} disabled={loading || saving} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
          {saving ? "Saving…" : "Save check-in instructions"}
        </button>
        <p className="text-xs text-muted-foreground">Email delivery uses the existing EMAIL_USER / EMAIL_PASSWORD setup. SMS is not enabled. The scheduled job also requires CRON_SECRET in production.</p>
      </div>
    </section>
  )
}
