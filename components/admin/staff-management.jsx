"use client"

import { useCallback, useEffect, useState } from "react"
import { bookingAdminRequest } from "@/lib/booking-admin-client"
import { toast } from "sonner"

const ROLE_LABELS = {
  admin: "Admin",
  "front-desk": "Front desk",
  finance: "Finance",
}

export default function StaffManagement() {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("front-desk")
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadStaff = useCallback(async () => {
    setLoading(true)
    try {
      const result = await bookingAdminRequest("/api/staff/invitations")
      setStaff(result.staff || [])
    } catch (error) {
      console.error("Failed to load staff access:", error)
      toast.error(error.message || "Staff access could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  const invite = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await bookingAdminRequest("/api/staff/invitations", {
        method: "POST",
        body: JSON.stringify({ action: "invite", email, role }),
      })
      setEmail("")
      toast.success("Staff invitation emailed.")
      await loadStaff()
    } catch (error) {
      console.error("Failed to invite staff:", error)
      toast.error(error.message || "Staff invitation could not be sent.")
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (memberEmail) => {
    if (!window.confirm(`Revoke staff access for ${memberEmail}?`)) return
    setSaving(true)
    try {
      await bookingAdminRequest("/api/staff/invitations", {
        method: "POST",
        body: JSON.stringify({ action: "revoke", email: memberEmail }),
      })
      toast.success("Staff access revoked.")
      await loadStaff()
    } catch (error) {
      console.error("Failed to revoke staff access:", error)
      toast.error(error.message || "Staff access could not be revoked.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold text-foreground">Staff Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Invite team members to use their own verified Google account. Access is revoked immediately when disabled.</p>
      </header>

      <form onSubmit={invite} className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[1fr_200px_auto]">
        <label className="text-sm font-medium text-foreground">
          Staff email
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium text-foreground">
          Role
          <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">
            {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={saving} className="self-end rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
          {saving ? "Saving…" : "Invite staff"}
        </button>
        <p className="text-xs text-muted-foreground sm:col-span-3">
          Admin: booking, payment, calendar, and staff management. Front desk: bookings, calendar, check-in/out, and walk-ins. Finance: payments, history, receipts, and refunds.
        </p>
      </form>

      {loading ? (
        <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading staff…</p>
      ) : staff.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No staff invitations yet.</p>
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {staff.map((member) => (
            <article key={member.email} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-foreground">{member.email}</p>
                <p className="text-sm text-muted-foreground">{ROLE_LABELS[member.role] || member.role} · {member.active ? "Active" : "Revoked"}</p>
              </div>
              {member.active ? (
                <button type="button" disabled={saving} onClick={() => revoke(member.email)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                  Revoke access
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
