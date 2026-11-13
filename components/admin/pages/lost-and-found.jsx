"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Loader2, MapPin, Plus, Search, X } from "lucide-react"
import { toast } from "sonner"
import { compressImageFileToDataUrl } from "@/lib/data-url-files"
import { resortAdminRequest } from "@/lib/admin-api-client"
import SearchField from "@/components/admin/search-field"

function localDate() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const EMPTY_FORM = { description: "", foundDate: localDate(), location: "", pickupLocation: "Front Desk", photo: "" }

export default function LostAndFound() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [photoName, setPhotoName] = useState("")
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [replyDrafts, setReplyDrafts] = useState({})
  const [replyingClaimId, setReplyingClaimId] = useState("")

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await resortAdminRequest("/api/resort/lost-and-found", undefined, "GET")
      if (!Array.isArray(result.items)) throw new Error("The Lost and Found service returned invalid data.")
      setItems(result.items)
    } catch (loadError) {
      setError(loadError.message || "Lost and Found items could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadItems() }, [loadItems])

  const filteredItems = items.filter((item) =>
    [item.description, item.location, item.foundDate, item.status, ...(item.claims || []).flatMap((claim) => [claim.name, claim.email, claim.contact])]
      .some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())),
  )

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const photo = await compressImageFileToDataUrl(file, {
        maxWidth: 1000,
        maxHeight: 800,
        quality: 0.72,
        maxChars: 120_000,
      })
      setForm((current) => ({ ...current, photo }))
      setPhotoName(file.name)
    } catch (photoError) {
      toast.error(photoError.message || "The photo could not be processed.")
    }
  }

  const saveItem = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await resortAdminRequest("/api/resort/lost-and-found", {
        action: "item.create",
        item: form,
      })
      toast.success("Found item added.")
      setForm(EMPTY_FORM)
      setPhotoName("")
      setFormOpen(false)
      await loadItems()
    } catch (saveError) {
      toast.error(saveError.message || "Found item could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const reviewClaim = async (item, claim, action) => {
    try {
      const result = await resortAdminRequest("/api/resort/lost-and-found", {
        action,
        itemId: item.id,
        claimId: claim.id,
      })
      if (result.emailSent) {
        toast.success(action === "claim.approve" ? "Claim approved, pickup reserved, and guest emailed." : "Claim declined and guest emailed.")
      } else {
        toast.warning("Claim decision saved, but the guest email could not be sent. Please contact the guest directly.")
      }
      await loadItems()
    } catch (reviewError) {
      toast.error(reviewError.message || "The claim could not be updated.")
    }
  }

  const replyToClaim = async (item, claim) => {
    const message = String(replyDrafts[claim.id] || "").trim()
    if (!message) return
    setReplyingClaimId(claim.id)
    try {
      const result = await resortAdminRequest("/api/resort/lost-and-found", {
        action: "claim.reply",
        itemId: item.id,
        claimId: claim.id,
        message,
      })
      setReplyDrafts((previous) => ({ ...previous, [claim.id]: "" }))
      if (result.emailSent) {
        toast.success("Reply saved and emailed to the guest.")
      } else {
        toast.warning("Reply saved to the claim conversation, but the email could not be sent. Please contact the guest directly.")
      }
      await loadItems()
    } catch (replyError) {
      toast.error(replyError.message || "Your reply could not be sent.")
    } finally {
      setReplyingClaimId("")
    }
  }

  const markClaimed = async (item) => {
    try {
      await resortAdminRequest("/api/resort/lost-and-found", {
        action: "item.mark-claimed",
        itemId: item.id,
      })
      toast.success("Item marked as collected.")
      await loadItems()
    } catch (claimError) {
      toast.error(claimError.message || "The item could not be updated.")
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Lost and Found</h1>
          <p className="mt-1 text-sm text-muted-foreground">Record found items and review guest claims for this resort.</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          {formOpen ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {formOpen ? "Cancel" : "Log found item"}
        </button>
      </header>

      {formOpen ? (
        <form onSubmit={saveItem} className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-foreground sm:col-span-2">
            Description
            <textarea required maxLength={1200} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2" placeholder="Describe the item so its owner can identify it." />
          </label>
          <label className="space-y-1 text-sm font-medium text-foreground">
            Date found
            <input required type="date" value={form.foundDate} onChange={(event) => setForm({ ...form, foundDate: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm font-medium text-foreground">
            Location found
            <input required maxLength={200} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2" placeholder="Pool, lobby, room…" />
          </label>
          <label className="space-y-1 text-sm font-medium text-foreground">
            Guest pickup point
            <input maxLength={200} value={form.pickupLocation} onChange={(event) => setForm({ ...form, pickupLocation: event.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2" placeholder="Front Desk" />
          </label>
          <label className="space-y-1 text-sm font-medium text-foreground sm:col-span-2">
            Photo
            <input required type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto} className="block w-full text-sm" />
            <span className="block text-xs text-muted-foreground">{photoName || "Choose a photo (PNG, JPEG, or WebP). It will be compressed before saving."}</span>
          </label>
          {form.photo ? <img src={form.photo} alt="Preview of found item" className="h-36 w-36 rounded-lg border border-border object-cover sm:col-span-2" /> : null}
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Save item
            </button>
          </div>
        </form>
      ) : null}

      <SearchField value={search} onChange={setSearch} placeholder="Search items and guest claims" />
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      {loading && items.length === 0 ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading Lost and Found…</p> : null}
      {!loading && items.length === 0 ? <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No found items have been logged.</p> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {filteredItems.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="grid sm:grid-cols-[150px_1fr]">
              <img src={item.photo} alt={`Found item: ${item.description}`} className="h-44 w-full bg-muted object-cover sm:h-full" />
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-semibold text-foreground">{item.description}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "claimed" ? "bg-slate-100 text-slate-700" : item.status === "reserved" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {item.status === "claimed" ? "Collected" : item.status === "reserved" ? "Reserved for pickup" : "Found"}
                  </span>
                </div>
                <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={14} aria-hidden="true" /> {item.location} · {item.foundDate}</p>
                <p className="text-xs text-muted-foreground">Guest pickup point after staff approval: {item.pickupLocation || "Front Desk"}</p>
                {item.status !== "claimed" ? (
                  <button type="button" onClick={() => void markClaimed(item)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted">
                    Mark as collected
                  </button>
                ) : null}
                <div className="border-t border-border pt-3">
                  <h3 className="text-sm font-semibold text-foreground">Guest claims ({item.claimCount || item.claims?.length || 0})</h3>
                  {Number(item.claimCount || 0) > (item.claims?.length || 0) ? <p className="mt-1 text-xs text-muted-foreground">Showing the latest {item.claims.length} claims.</p> : null}
                  {item.claims?.length ? (
                    <ul className="mt-2 space-y-3">
                      {item.claims.map((claim) => (
                        <li key={claim.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p className="font-medium text-foreground">{claim.name} · {claim.status}</p>
                          <p className="text-muted-foreground">{claim.email} · {claim.contact}</p>
                          {claim.stayVerified ? (
                            <p className="mt-1 text-xs text-emerald-800">
                              Verified booking {claim.reservationId} · {claim.checkIn} to {claim.checkOut}
                              {claim.checkedInAt ? ` · checked in ${new Date(claim.checkedInAt).toLocaleString()}` : ""}
                              {claim.checkedOutAt ? ` · checked out ${new Date(claim.checkedOutAt).toLocaleString()}` : ""}
                            </p>
                          ) : null}
                          {claim.message && !claim.messages?.length ? <p className="mt-1 text-muted-foreground">{claim.message}</p> : null}
                          {claim.messages?.length ? (
                            <div className="mt-3 space-y-2 border-l-2 border-emerald-200 pl-3">
                              {claim.messages.map((message) => (
                                <div key={message.id} className="rounded-md bg-background p-2">
                                  <p className="text-[11px] font-semibold text-muted-foreground">{message.authorRole === "staff" ? "Resort staff" : claim.name}</p>
                                  <p className="whitespace-pre-wrap text-sm text-foreground">{message.message}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <form
                            onSubmit={(event) => {
                              event.preventDefault()
                              void replyToClaim(item, claim)
                            }}
                            className="mt-3 space-y-2"
                          >
                            <label className="block text-xs font-semibold text-foreground">
                              Reply to guest (saved in the claim conversation and emailed)
                              <textarea
                                maxLength={1000}
                                rows={2}
                                value={replyDrafts[claim.id] || ""}
                                onChange={(event) => setReplyDrafts((previous) => ({ ...previous, [claim.id]: event.target.value }))}
                                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm font-normal"
                                placeholder="Confirm the pickup point or ask for more identifying details."
                              />
                            </label>
                            <button type="submit" disabled={replyingClaimId === claim.id || !String(replyDrafts[claim.id] || "").trim()} className="inline-flex items-center gap-1 rounded-md border border-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50">
                              {replyingClaimId === claim.id ? "Sending…" : "Send reply"}
                            </button>
                          </form>
                          {claim.status === "pending" && item.status === "found" ? (
                            <div className="mt-2 flex gap-2">
                              <button type="button" onClick={() => void reviewClaim(item, claim, "claim.approve")} className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white"><Check size={14} aria-hidden="true" /> Approve & reserve for pickup</button>
                              <button type="button" onClick={() => void reviewClaim(item, claim, "claim.reject")} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-background">Decline</button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-muted-foreground">No claims submitted.</p>}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!loading && items.length > 0 && filteredItems.length === 0 ? <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"><Search className="mr-2 inline h-4 w-4" aria-hidden="true" />No items match that search.</p> : null}
    </section>
  )
}
