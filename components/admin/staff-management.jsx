"use client"

import { useCallback, useEffect, useState } from "react"
import { bookingAdminRequest } from "@/lib/booking-admin-client"
import { toast } from "sonner"
import SearchField from "@/components/admin/search-field"

const ROLE_LABELS = {
  admin: "Admin",
  "front-desk": "Front desk",
  finance: "Finance",
}

export default function StaffManagement() {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [contact, setContact] = useState("")
  const [role, setRole] = useState("front-desk")
  const [registered, setRegistered] = useState(null)
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

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

  const checkAccount = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await bookingAdminRequest("/api/staff/invitations", {
        method: "POST",
        body: JSON.stringify({ action: "lookup", email, role }),
      })
      setRegistered(result.registered)
      if (result.registered) {
        setName("")
        setContact("")
      }
    } catch (error) {
      console.error("Failed to check staff account:", error)
      toast.error(error.message || "The account could not be checked.")
    } finally {
      setSaving(false)
    }
  }

  const addStaff = async (event) => {
    event.preventDefault()
    if (registered === false && (!name.trim() || !contact.trim())) {
      toast.error("Enter the new staff member's name and contact details.")
      return
    }
    setSaving(true)
    try {
      await bookingAdminRequest("/api/staff/invitations", {
        method: "POST",
        body: JSON.stringify({ action: "invite", email, name, contact, role }),
      })
      setEmail("")
      setName("")
      setContact("")
      setRegistered(null)
      toast.success("Staff account added with Pending status.")
      await loadStaff()
    } catch (error) {
      console.error("Failed to add staff:", error)
      toast.error(error.message || "Staff account could not be added.")
    } finally {
      setSaving(false)
    }
  }

  const manageStaff = async (action, member) => {
    if (action === "revoke" && !window.confirm(`Revoke staff access for ${member.email}?`)) return
    setSaving(true)
    try {
      await bookingAdminRequest("/api/staff/invitations", {
        method: "POST",
        body: JSON.stringify({ action, email: member.email }),
      })
      toast.success(action === "approve"
        ? "Staff approved. Password setup and email verification instructions were sent."
        : "Staff access revoked.")
      await loadStaff()
    } catch (error) {
      console.error(`Failed to ${action} staff:`, error)
      toast.error(error.message || "Staff access could not be updated.")
    } finally {
      setSaving(false)
    }
  }

  const isPending = (member) => member.status.toLowerCase() === "pending"
  const isApproved = (member) => member.status.toLowerCase() === "approved"
  const filteredStaff = staff.filter((member) =>
    [member.name, member.email, member.contact, member.role, member.status]
      .some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())),
  )

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold text-foreground">Staff Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a registered user or create an account for someone new. Staff remain Pending until you approve them.
        </p>
      </header>

      <form onSubmit={checkAccount} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <label className="text-sm font-medium text-foreground">
            Staff email
            <input
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setRegistered(null)
              }}
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
            {saving ? "Checking…" : "Check account"}
          </button>
        </div>

        {registered === true ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-900">A registered account was found. Adding it will create a pending staff assignment for this resort.</p>
            <button type="button" disabled={saving} onClick={addStaff} className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {saving ? "Saving…" : "Add registered user"}
            </button>
          </div>
        ) : null}

        {registered === false ? (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <p className="text-sm text-muted-foreground">No account was found. Enter the new staff member’s details to create a pending account.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-foreground">
                Name
                <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-foreground">
                Contact
                <input required maxLength={100} value={contact} onChange={(event) => setContact(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2" />
              </label>
            </div>
            <button type="button" disabled={saving} onClick={addStaff} className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {saving ? "Creating…" : "Create account and add staff"}
            </button>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Admin: bookings, payments, calendar, and staff management. Front desk: bookings, calendar, check-in/out, and walk-ins. Finance: payments, history, receipts, and refunds.
        </p>
      </form>

      <SearchField value={search} onChange={setSearch} placeholder="Search name, email, role, or status" />

      {loading ? (
        <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading staff…</p>
      ) : staff.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No staff accounts yet.</p>
      ) : filteredStaff.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No staff match “{search}”.</p>
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {filteredStaff.map((member) => (
            <article key={member.email} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-foreground">{member.name || member.email}</p>
                <p className="text-sm text-muted-foreground">{member.email}{member.contact ? ` · ${member.contact}` : ""}</p>
                <p className="text-sm text-muted-foreground">
                  {ROLE_LABELS[member.role] || member.role} · {member.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isPending(member) ? (
                  <button type="button" disabled={saving} onClick={() => manageStaff("approve", member)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                    Approve
                  </button>
                ) : null}
                {isApproved(member) ? (
                  <>
                    <button type="button" disabled={saving} onClick={() => manageStaff("approve", member)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60">
                      Resend setup &amp; verification
                    </button>
                    <button type="button" disabled={saving} onClick={() => manageStaff("revoke", member)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                      Revoke access
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
