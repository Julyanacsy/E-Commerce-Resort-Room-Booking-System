"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const EMPTY_FORM = {
  name: "",
  number: "",
  type: "Standard",
  description: "",
  price: "",
  discount: "0",
  maxGuests: "2",
  bedType: "Queen",
  beds: "1",
  amenities: "Wi‑Fi, Air conditioning, Private bath",
  availability: "Available",
  featured: false,
  images: [],
}

export function AddRoomModal({ open, onClose, onSave, duplicateScopeOwnerUid }) {
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM)
    }
  }, [open])

  const summary = useMemo(() => {
    const count = Array.isArray(form.images) ? form.images.length : 0
    return count ? `${count} image${count > 1 ? "s" : ""} selected` : "No images yet"
  }, [form.images])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const payload = {
      ...form,
      amenities: String(form.amenities || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      price: Number(form.price) || 0,
      discount: Number(form.discount) || 0,
      maxGuests: Number(form.maxGuests) || 1,
      beds: Number(form.beds) || 1,
      images: Array.isArray(form.images) ? form.images : [],
      featured: Boolean(form.featured),
      duplicateScopeOwnerUid,
    }

    onSave?.(payload)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.() }}>
      <DialogContent className="max-w-2xl overflow-y-auto rounded-xl bg-white p-0 text-left dark:bg-slate-900">
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-white">Add room</DialogTitle>
            <DialogDescription className="text-sm text-slate-600 dark:text-slate-300">
              Add a room listing for this resort. Fields below save in the same shape used by the resort admin dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Room name</span>
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="Ocean View Suite"
                required
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Room number</span>
              <input
                value={form.number}
                onChange={(event) => updateField("number", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="101"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Type</span>
              <input
                value={form.type}
                onChange={(event) => updateField("type", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="Standard"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Availability</span>
              <select
                value={form.availability}
                onChange={(event) => updateField("availability", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="Available">Available</option>
                <option value="Booked">Booked</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Price</span>
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(event) => updateField("price", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="3500"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Discount %</span>
              <input
                type="number"
                min="0"
                max="100"
                value={form.discount}
                onChange={(event) => updateField("discount", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="0"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Max guests</span>
              <input
                type="number"
                min="1"
                value={form.maxGuests}
                onChange={(event) => updateField("maxGuests", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Beds</span>
              <input
                type="number"
                min="1"
                value={form.beds}
                onChange={(event) => updateField("beds", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              <span>Amenities</span>
              <input
                value={form.amenities}
                onChange={(event) => updateField("amenities", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="Wi‑Fi, Air conditioning, Private bath"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              <span>Description</span>
              <textarea
                rows={4}
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="Comfortable room with a private balcony and garden view"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <span>{summary}</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => updateField("featured", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Featured room
            </label>
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save room</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
