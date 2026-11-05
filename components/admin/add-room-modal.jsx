"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { compressImageFileToDataUrl, MAX_ROOM_IMAGE_DATA_URL_CHARS } from "@/lib/data-url-files"
import { resolveGoogleMapsUrl } from "@/lib/maps-preview-url"

const MAX_ROOM_IMAGES = 6

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
  mapsUrl: "",
}

export function AddRoomModal({ open, onClose, onSave, duplicateScopeOwnerUid, existingRooms = [] }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [formError, setFormError] = useState("")

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM)
      setFormError("")
    }
  }, [open])

  const summary = useMemo(() => {
    const count = Array.isArray(form.images) ? form.images.length : 0
    return `${count} of ${MAX_ROOM_IMAGES} images selected`
  }, [form.images])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ""
    if (!files.length) return

    const remainingSlots = MAX_ROOM_IMAGES - form.images.length
    if (files.length > remainingSlots) {
      toast.error(`You can upload up to ${MAX_ROOM_IMAGES} room images.`)
    }
    const selectedFiles = files.slice(0, remainingSlots)
    if (!selectedFiles.length) return

    setImageUploading(true)
    setFormError("")
    try {
      const images = await Promise.all(
        selectedFiles.map((file) =>
          compressImageFileToDataUrl(file, {
            maxWidth: 1400,
            maxHeight: 1000,
            quality: 0.78,
            maxChars: MAX_ROOM_IMAGE_DATA_URL_CHARS,
          }),
        ),
      )
      setForm((current) => ({ ...current, images: [...current.images, ...images].slice(0, MAX_ROOM_IMAGES) }))
    } catch (error) {
      console.error("Failed to process room images", error)
      toast.error(error?.message || "Failed to process room images.")
    } finally {
      setImageUploading(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError("")

    const roomName = form.name.trim()
    const roomNumber = form.number.trim()
    const nameExists = existingRooms.some(
      (room) => String(room.name || "").trim().toLowerCase() === roomName.toLowerCase(),
    )
    const numberExists =
      roomNumber &&
      existingRooms.some(
        (room) => String(room.roomNumber || "").trim().toLowerCase() === roomNumber.toLowerCase(),
      )
    if (nameExists || numberExists) {
      setFormError(nameExists ? "A room with this name already exists." : "A room with this number already exists.")
      return
    }

    const price = Number(form.price)
    const discount = Number(form.discount)
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) {
      setFormError("Enter a valid price and a discount between 0 and 100.")
      return
    }

    setSaving(true)
    try {
      let mapsUrl = ""
      try {
        mapsUrl = await resolveGoogleMapsUrl(form.mapsUrl)
      } catch (error) {
        setFormError(error?.message || "Enter a valid Google Maps link.")
        return
      }

      const payload = {
        ...form,
        name: roomName,
        number: roomNumber,
        mapsUrl,
        amenities: String(form.amenities || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        price,
        discount,
        maxGuests: Number(form.maxGuests) || 1,
        beds: Number(form.beds) || 1,
        images: Array.isArray(form.images) ? form.images : [],
        featured: Boolean(form.featured),
        duplicateScopeOwnerUid,
      }

      await onSave?.(payload)
    } catch (error) {
      console.error("Failed to save room", error)
      toast.error(error?.message || "Failed to save room.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving && !imageUploading) onClose?.()
      }}
    >
      <DialogContent className="max-w-2xl overflow-y-auto rounded-xl bg-white p-0 text-left dark:bg-slate-900">
        <form onSubmit={handleSubmit} className="max-h-[90vh] space-y-5 overflow-y-auto p-6">
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
              <span>Bed type</span>
              <input
                value={form.bedType}
                onChange={(event) => updateField("bedType", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="Queen"
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
                step="0.01"
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
                step="0.01"
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
              <span>Room Google Maps link (optional)</span>
              <input
                type="url"
                value={form.mapsUrl}
                onChange={(event) => updateField("mapsUrl", event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none ring-0 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="https://maps.app.goo.gl/…"
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

          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <div className="flex items-center justify-between gap-4">
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
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200">
              {imageUploading ? "Processing images…" : "Upload room images"}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={saving || imageUploading || form.images.length >= MAX_ROOM_IMAGES}
                onChange={handleImageUpload}
                className="sr-only"
              />
            </label>
            <p className="text-xs">Images are compressed before saving. Up to six JPG, PNG, or WebP images.</p>
            {form.images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {form.images.map((image, index) => (
                  <div key={`${index}-${image.length}`} className="relative">
                    <img
                      src={image}
                      alt={`Room image ${index + 1}`}
                      className="h-28 w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          images: current.images.filter((_, imageIndex) => imageIndex !== index),
                        }))
                      }
                      className="absolute right-2 top-2 rounded-full bg-slate-950/75 px-2 py-1 text-xs font-semibold text-white"
                      aria-label={`Remove room image ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || imageUploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || imageUploading}>
              {saving ? "Saving…" : "Save room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
