"use client"

import { useEffect, useState } from "react"

const EMPTY_FORM = {
  ownerUid: "",
  ownerEmail: "",
  name: "",
  location: "",
  mapsUrl: "",
  description: "",
  category: "Resort",
  listingImage: "",
  tags: "",
}

function getFormValues(resort) {
  if (!resort) return EMPTY_FORM
  return {
    ownerUid: String(resort.ownerUid || resort.id || ""),
    ownerEmail: String(resort.ownerEmail || ""),
    name: String(resort.name || ""),
    location: String(resort.location || ""),
    mapsUrl: String(resort.mapsUrl || ""),
    description: String(resort.description || ""),
    category: String(resort.category || "Resort"),
    listingImage: String(resort.listingImage || ""),
    tags: Array.isArray(resort.tags) ? resort.tags.join(", ") : "",
  }
}

export default function ResortEditorModal({ resort, theme, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => getFormValues(resort))

  useEffect(() => {
    setForm(getFormValues(resort))
  }, [resort])

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const inputClass =
    theme === "dark"
      ? "rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
      : "rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-foreground"

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="resort-editor-title"
        onSubmit={(event) => {
          event.preventDefault()
          onSave(form)
        }}
        className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-7 ${
          theme === "dark" ? "border-slate-600 bg-slate-800" : "border-emerald-100 bg-white"
        }`}
      >
        <h2
          id="resort-editor-title"
          className={`text-xl font-bold ${theme === "dark" ? "text-white" : "text-emerald-900"}`}
        >
          {resort ? "Edit resort listing" : "Create resort listing"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {resort
            ? "Update listing details. The current review status will remain unchanged."
              : "Create a pending listing for an owner who has already registered a resort account."}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Owner Firebase UID *</span>
            <input
              value={form.ownerUid}
              onChange={(event) => update("ownerUid", event.target.value)}
              className={`${inputClass} font-mono`}
              required
              disabled={Boolean(resort)}
              maxLength={128}
              pattern="[A-Za-z0-9_-]+"
              title="Enter the owner's Firebase Auth UID."
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Owner email</span>
            <input
              type="email"
              value={form.ownerEmail}
              onChange={(event) => update("ownerEmail", event.target.value)}
              className={inputClass}
              maxLength={254}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Category</span>
            <input
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
              className={inputClass}
              maxLength={80}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Resort name *</span>
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              className={inputClass}
              required
              maxLength={120}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Location *</span>
            <input
              value={form.location}
              onChange={(event) => update("location", event.target.value)}
              className={inputClass}
              required
              maxLength={240}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Google Maps link *</span>
            <input
              type="url"
              value={form.mapsUrl}
              onChange={(event) => update("mapsUrl", event.target.value)}
              className={inputClass}
              required
              maxLength={2000}
              placeholder="https://maps.google.com/..."
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Listing image URL</span>
            <input
              type="url"
              value={form.listingImage}
              onChange={(event) => update("listingImage", event.target.value)}
              className={inputClass}
              maxLength={2000}
              placeholder="https://..."
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Tags (comma-separated)</span>
            <input
              value={form.tags}
              onChange={(event) => update("tags", event.target.value)}
              className={inputClass}
              maxLength={500}
              placeholder="Beachfront, Pool, Family-friendly"
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              className={inputClass}
              rows={4}
              maxLength={2000}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-emerald-200 px-5 py-2.5 text-sm font-semibold text-emerald-900 disabled:opacity-60 dark:border-slate-600 dark:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {busy ? "Saving…" : resort ? "Save changes" : "Create listing"}
          </button>
        </div>
      </form>
    </div>
  )
}
