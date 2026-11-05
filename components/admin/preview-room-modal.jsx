"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, X } from "lucide-react"

const ROOM_TYPES = ["Standard", "Deluxe", "Family", "Executive", "Suite"]
const BED_TYPES = ["Single", "Double", "Queen", "King", "Bunk"]
const AMENITY_PRESETS = [
  "Wifi",
  "Aircon",
  "Television",
  "Hot & Cold Shower",
  "Refrigerator",
  "Balcony",
  "Ocean View",
  "Garden View",
  "Complimentary Breakfast",
  "Room Service",
]
const STATUS_OPTIONS = ["Available", "Maintenance", "Unavailable"]

const normalizeRoom = (room) => ({
  name: room?.name ?? "",
  number: room?.roomNumber ?? "",
  type: room?.type ?? ROOM_TYPES[0],
  description: room?.description ?? "",
  price: room?.price ?? "",
  discount: room?.discount ?? "",
  maxGuests: room?.maxGuests ?? 1,
  bedType: room?.bedType ?? BED_TYPES[0],
  beds: room?.beds ?? 1,
  images: room?.images ?? [],
  amenities: new Set(room?.amenities ?? []),
  availability: room?.availability ?? STATUS_OPTIONS[0],
  featured: Boolean(room?.featured),
})

export function PreviewRoomModal({ open, room, onClose, onSave }) {
  const [form, setForm] = useState(() => normalizeRoom(room))
  const [customAmenity, setCustomAmenity] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const amenityList = useMemo(() => Array.from(form.amenities), [form.amenities])

  useEffect(() => {
    if (room && open) {
      setForm(normalizeRoom(room))
      setCustomAmenity("")
      setSaving(false)
      setConfirmOpen(false)
    }
  }, [room, open])

  useEffect(() => {
    if (!open) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  if (!open || !room) return null

  const handleFieldChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleNumberClampChange = (field, min, max) => (event) => {
    const numeric = Number(event.target.value)
    if (Number.isNaN(numeric)) return
    setForm((prev) => ({ ...prev, [field]: Math.min(max, Math.max(min, numeric)) }))
  }

  const handleAmenityToggle = (amenity) => {
    setForm((prev) => {
      const next = new Set(prev.amenities)
      if (next.has(amenity)) {
        next.delete(amenity)
      } else {
        next.add(amenity)
      }
      return { ...prev, amenities: next }
    })
  }

  const handleCustomAmenityAdd = () => {
    const trimmed = customAmenity.trim()
    if (!trimmed) return
    handleAmenityToggle(trimmed)
    setCustomAmenity("")
  }

  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    try {
      const encoded = await Promise.all(files.map((file) => readFileAsDataURL(file)))
      setForm((prev) => ({ ...prev, images: [...prev.images, ...encoded].slice(0, 6) }))
    } catch (error) {
      console.error("Failed to encode images", error)
    }
  }

  const handleImageRemove = (index) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, idx) => idx !== index) }))
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onSave?.({
        id: room.id,
        name: form.name,
        number: form.number,
        type: form.type,
        description: form.description,
        price: form.price,
        discount: form.discount,
        maxGuests: form.maxGuests,
        bedType: form.bedType,
        beds: form.beds,
        amenities: amenityList,
        availability: form.availability,
        featured: form.featured,
        images: form.images,
      })
    } finally {
      setSaving(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8 lg:items-start"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose?.()
        }}
      >
        <div className="relative h-[92vh] w-full max-w-5xl rounded-t-3xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-emerald-100 dark:ring-slate-700 animate-bottom-sheet lg:ml-auto lg:h-full lg:rounded-3xl lg:animate-side-sheet">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700"
            aria-label="Close preview modal"
            type="button"
          >
            <X size={18} />
          </button>
          <form className="flex h-full flex-col divide-y divide-gray-100 dark:divide-slate-700 lg:flex-row lg:divide-x lg:divide-y-0" onSubmit={(event) => event.preventDefault()}>
            <div className="flex-1 overflow-y-auto px-6 pb-8 pt-16 lg:px-8 lg:pt-12">
              <header className="mb-8">
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Preview Room</p>
                <h2 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{room.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Inspect and edit the latest details for this room.</p>
              </header>

              <section className="space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">Basic Info</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Room Name / Title</label>
                    <input
                      value={form.name}
                      onChange={handleFieldChange("name")}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Room Number</label>
                    <input
                      value={form.number}
                      onChange={handleFieldChange("number")}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Room Type</label>
                    <select
                      value={form.type}
                      onChange={handleFieldChange("type")}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    >
                      {ROOM_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Description</label>
                  <textarea
                    value={form.description}
                    onChange={handleFieldChange("description")}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                  />
                </div>
              </section>

              <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">Pricing</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Price per Night</label>
                    <input
                      type="number"
                      min="0"
                      value={form.price}
                      onChange={handleFieldChange("price")}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Discount (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.discount}
                      onChange={handleFieldChange("discount")}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Max Guests</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={form.maxGuests}
                      onChange={handleNumberClampChange("maxGuests", 1, 10)}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    />
                  </div>
                </div>
              </section>

              <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">Bed & Capacity</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Bed Type</label>
                    <select
                      value={form.bedType}
                      onChange={handleFieldChange("bedType")}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    >
                      {BED_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Number of Beds</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={form.beds}
                      onChange={handleNumberClampChange("beds", 1, 6)}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    />
                  </div>
                </div>
              </section>

              <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">Images</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  {form.images.map((image, index) => (
                    <div key={`${room.id}-preview-${index}`} className="group relative">
                      <img src={image} alt={`Preview ${index + 1}`} className="h-32 w-full rounded-2xl object-cover" />
                      <button
                        type="button"
                        onClick={() => handleImageRemove(index)}
                        className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/70 dark:bg-slate-900/80 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {form.images.length < 6 && (
                    <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/30 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition hover:border-emerald-500 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/50">
                      Upload
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">You can upload up to six highlight images.</p>
              </section>

              <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">Amenities</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {AMENITY_PRESETS.map((amenity) => (
                    <label
                      key={amenity}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                        form.amenities.has(amenity)
                          ? "border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200"
                          : "border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:border-emerald-200 dark:hover:border-emerald-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.amenities.has(amenity)}
                        onChange={() => handleAmenityToggle(amenity)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 focus:ring-emerald-500"
                      />
                      {amenity}
                    </label>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={customAmenity}
                    onChange={(event) => setCustomAmenity(event.target.value)}
                    placeholder="Add custom amenity"
                    className="flex-1 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                  />
                  <button
                    type="button"
                    onClick={handleCustomAmenityAdd}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300 transition hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-900 dark:hover:text-emerald-200"
                  >
                    <Plus size={16} />
                    Add Amenity
                  </button>
                </div>
              </section>

              <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">Status</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Availability</label>
                    <select
                      value={form.availability}
                      onChange={handleFieldChange("availability")}
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-slate-600 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Featured Room?</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Showcase this room prominently on the site.</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={form.featured}
                        onChange={(event) => setForm((prev) => ({ ...prev, featured: event.target.checked }))}
                        className="peer sr-only"
                      />
                      <span className="h-6 w-11 rounded-full bg-gray-200 dark:bg-slate-600 transition peer-checked:bg-emerald-600 dark:peer-checked:bg-emerald-500" />
                      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                    </label>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex w-full flex-col gap-4 overflow-y-auto px-6 pb-8 pt-6 lg:max-w-sm lg:px-6">
              <div className="rounded-2xl border border-emerald-100 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/30 p-5 text-emerald-900 dark:text-emerald-200">
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Summary</p>
                <h4 className="mt-2 text-xl font-bold">{form.name || "Unnamed Room"}</h4>
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  {form.type} • {form.maxGuests || 1} Guests • {form.bedType}
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <p>
                    <span className="font-semibold">Price:</span> {form.price ? `₱${form.price}` : "—"} / night
                  </p>
                  <p>
                    <span className="font-semibold">Discount:</span> {form.discount ? `${form.discount}%` : "None"}
                  </p>
                  <p>
                    <span className="font-semibold">Amenities:</span> {amenityList.length ? amenityList.join(", ") : "None"}
                  </p>
                  <p>
                    <span className="font-semibold">Status:</span> {form.availability}
                  </p>
                </div>
              </div>
              <div className="mt-auto flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 dark:bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-700/30 dark:shadow-emerald-600/30 transition hover:bg-emerald-800 dark:hover:bg-emerald-500"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-gray-200 dark:border-slate-600 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 transition hover:border-gray-400 dark:hover:border-slate-500"
                >
                  Close
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-2xl">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Save changes?</h4>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This will update the room details immediately.</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-lg border border-gray-200 dark:border-slate-600 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 transition hover:border-gray-400 dark:hover:border-slate-500"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 rounded-lg bg-emerald-700 dark:bg-emerald-600 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                    Saving…
                  </span>
                ) : (
                  "Yes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

