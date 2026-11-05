"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Upload, X } from "lucide-react"
import { db } from "@/lib/firebase"
import { collection, getDocs, query, where } from "firebase/firestore"
import { toast } from "sonner"

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

const createDefaultForm = () => ({
  name: "",
  number: "",
  type: ROOM_TYPES[0],
  description: "",
  price: "",
  discount: "",
  maxGuests: 1,
  bedType: BED_TYPES[0],
  beds: 1,
  images: [],
  amenities: new Set(["Wifi", "Aircon", "Television"]),
  availability: STATUS_OPTIONS[0],
  featured: false,
})

/**
 * @param {{ open: boolean; onClose: () => void; onSave: (payload: unknown) => Promise<void>; duplicateScopeOwnerUid?: string | null }} props
 */
export function AddRoomModal({ open, onClose, onSave, duplicateScopeOwnerUid = null }) {
  const [form, setForm] = useState(() => createDefaultForm())
  const [customAmenity, setCustomAmenity] = useState("")
  const [saving, setSaving] = useState(false)
  const [existingRooms, setExistingRooms] = useState([])
  const [errors, setErrors] = useState({ name: "", number: "" })
  const [showNameDropdown, setShowNameDropdown] = useState(false)
  const [showNumberDropdown, setShowNumberDropdown] = useState(false)
  const amenityList = useMemo(() => Array.from(form.amenities), [form.amenities])

  // Get unique existing room names and numbers
  const existingRoomNames = useMemo(() => {
    const names = existingRooms
      .map((room) => room.name)
      .filter((name) => name && name.trim())
      .map((name) => name.trim())
    return [...new Set(names)]
  }, [existingRooms])

  const existingRoomNumbers = useMemo(() => {
    const numbers = existingRooms
      .map((room) => room.roomNumber)
      .filter((num) => num && num.trim())
      .map((num) => num.trim())
    return [...new Set(numbers)]
  }, [existingRooms])

  // Filter existing names/numbers based on input
  const filteredNames = useMemo(() => {
    if (!showNameDropdown) return []
    if (!form.name) return existingRoomNames
    const searchTerm = form.name.toLowerCase()
    return existingRoomNames.filter((name) =>
      name.toLowerCase().includes(searchTerm)
    )
  }, [form.name, existingRoomNames, showNameDropdown])

  const filteredNumbers = useMemo(() => {
    if (!showNumberDropdown) return []
    if (!form.number) return existingRoomNumbers
    const searchTerm = form.number.toLowerCase()
    return existingRoomNumbers.filter((num) =>
      num.toLowerCase().includes(searchTerm)
    )
  }, [form.number, existingRoomNumbers, showNumberDropdown])

  // Fetch existing rooms when modal opens
  useEffect(() => {
    if (!open) {
      setForm(createDefaultForm())
      setCustomAmenity("")
      setSaving(false)
      setErrors({ name: "", number: "" })
      setShowNameDropdown(false)
      setShowNumberDropdown(false)
      return
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    // Fetch existing rooms for validation
    const fetchExistingRooms = async () => {
      try {
        const roomsRef = collection(db, "rooms")
        let snapshot
        if (duplicateScopeOwnerUid) {
          snapshot = await getDocs(query(roomsRef, where("ownerUid", "==", duplicateScopeOwnerUid)))
        } else {
          snapshot = await getDocs(roomsRef)
        }
        let rooms = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        if (!duplicateScopeOwnerUid) {
          rooms = rooms.filter((r) => !r.ownerUid)
        }
        setExistingRooms(rooms)
      } catch (error) {
        console.error("Error fetching existing rooms:", error)
      }
    }

    fetchExistingRooms()

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [open, duplicateScopeOwnerUid])

  if (!open) {
    return null
  }

  // Check for duplicates
  const checkDuplicates = (name, number) => {
    const nameError = name && existingRooms.some(
      (room) => room.name?.trim().toLowerCase() === name?.trim().toLowerCase()
    )
      ? "Room name already exists"
      : ""

    const numberError = number && existingRooms.some(
      (room) => room.roomNumber?.trim().toLowerCase() === number?.trim().toLowerCase()
    )
      ? "Room number already exists"
      : ""

    return { name: nameError, number: numberError }
  }

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value
    setForm((prev) => {
      const updatedForm = { ...prev, [field]: value }
      
      // Show dropdown when typing
      if (field === "name") {
        setShowNameDropdown(value.length > 0)
      } else if (field === "number") {
        setShowNumberDropdown(value.length > 0)
      }
      
      // Check for duplicates in real-time when user types
      if (field === "name" || field === "number") {
        const validationErrors = checkDuplicates(
          field === "name" ? value : updatedForm.name,
          field === "number" ? value : updatedForm.number
        )
        setErrors((prev) => ({ ...prev, [field]: validationErrors[field] }))
      }
      
      return updatedForm
    })
  }

  const handleNameFocus = () => {
    setShowNameDropdown(true)
  }

  const handleNumberFocus = () => {
    setShowNumberDropdown(true)
  }

  const handleNameBlur = () => {
    // Delay to allow dropdown click
    setTimeout(() => setShowNameDropdown(false), 200)
  }

  const handleNumberBlur = () => {
    // Delay to allow dropdown click
    setTimeout(() => setShowNumberDropdown(false), 200)
  }

  const handleAmenityToggle = (amenity) => {
    setForm((prev) => {
      const nextSet = new Set(prev.amenities)
      if (nextSet.has(amenity)) {
        nextSet.delete(amenity)
      } else {
        nextSet.add(amenity)
      }
      return { ...prev, amenities: nextSet }
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
      const encoded = await Promise.all(
        files.map(async (file) => ({
          id: `${file.name}-${crypto.randomUUID()}`,
          url: await readFileAsDataURL(file),
        })),
      )
      setForm((prev) => ({ ...prev, images: [...prev.images, ...encoded].slice(0, 6) }))
    } catch (error) {
      console.error("Failed to encode images", error)
    }
  }

  const handleImageRemove = (id) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((img) => img.id !== id) }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    
    // Check for duplicates before submitting
    const validationErrors = checkDuplicates(form.name, form.number)
    
    if (validationErrors.name || validationErrors.number) {
      setErrors(validationErrors)
      if (validationErrors.name) {
        toast.error(validationErrors.name)
      }
      if (validationErrors.number) {
        toast.error(validationErrors.number)
      }
      return
    }

    setSaving(true)
    setErrors({ name: "", number: "" })
    
    const payload = {
      ...form,
      amenities: amenityList,
      images: form.images.map((img) => img.url),
    }
    try {
      await onSave?.(payload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8 lg:items-start"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div className="relative h-[92vh] w-full max-w-4xl rounded-t-3xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-emerald-100 dark:ring-slate-700 animate-bottom-sheet lg:ml-auto lg:h-full lg:rounded-3xl lg:animate-side-sheet">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700"
          aria-label="Close add room modal"
          type="button"
        >
          <X size={18} />
        </button>
        <form className="flex h-full flex-col divide-y divide-gray-100 dark:divide-slate-700 lg:flex-row lg:divide-x lg:divide-y-0" onSubmit={handleSubmit}>
          <div className="flex-1 overflow-y-auto px-6 pb-8 pt-16 lg:px-8 lg:pt-12 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <header className="mb-8">
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Add New Room</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">Room Details</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fill out the basics, pricing, media, and amenities.</p>
            </header>

            <section className="space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">1. Room Basic Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Room Name / Title *</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={handleFieldChange("name")}
                      onFocus={handleNameFocus}
                      onBlur={handleNameBlur}
                      className={`w-full rounded-xl border px-4 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                        errors.name
                          ? "border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900"
                          : "border-gray-200 dark:border-slate-600 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                      }`}
                      placeholder="Deluxe Suite, Ocean View Family Room"
                    />
                    {showNameDropdown && filteredNames.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-slate-700">
                          {form.name ? "Matching Existing (Cannot Select)" : "All Existing Room Names (Cannot Select)"}
                        </div>
                        {filteredNames.map((name, idx) => (
                          <div
                            key={idx}
                            className="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-600"
                          >
                            {name} (Already Exists)
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Room Number *</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={form.number}
                      onChange={handleFieldChange("number")}
                      onFocus={handleNumberFocus}
                      onBlur={handleNumberBlur}
                      className={`w-full rounded-xl border px-4 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                        errors.number
                          ? "border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900"
                          : "border-gray-200 dark:border-slate-600 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                      }`}
                      placeholder="101, A203"
                    />
                    {showNumberDropdown && filteredNumbers.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-slate-700">
                          {form.number ? "Matching Existing (Cannot Select)" : "All Existing Room Numbers (Cannot Select)"}
                        </div>
                        {filteredNumbers.map((num, idx) => (
                          <div
                            key={idx}
                            className="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-600"
                          >
                            {num} (Already Exists)
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {errors.number && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.number}</p>
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Room Type *</label>
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
                <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Description *</label>
                <textarea
                  required
                  value={form.description}
                  onChange={handleFieldChange("description")}
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                  placeholder="Highlight space, view, services, and what makes it special."
                />
              </div>
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">2. Room Pricing</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Price per Night *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.price}
                    onChange={handleFieldChange("price")}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    placeholder="5500"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Discount (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.discount}
                    onChange={handleFieldChange("discount")}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                    placeholder="Optional"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Max Guests *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={form.maxGuests}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 1
                      setForm((prev) => ({ ...prev, maxGuests: Math.min(10, Math.max(1, value)) }))
                    }}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                  />
                </div>
              </div>
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">3. Bed & Capacity</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2.block text-sm font-semibold text-gray-800 dark:text-gray-200">Bed Type *</label>
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
                  <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">Number of Beds *</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={form.beds}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 1
                      setForm((prev) => ({ ...prev, beds: Math.min(6, Math.max(1, value)) }))
                    }}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white px-4 py-2.5 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900"
                  />
                </div>
              </div>
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">4. Room Media</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {form.images.map((image) => (
                  <div key={image.id} className="group relative">
                    <img src={image.url} alt="Room preview" className="h-32 w-full rounded-2xl object-cover" />
                    <button
                      type="button"
                      onClick={() => handleImageRemove(image.id)}
                      className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/70 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {form.images.length < 6 && (
                  <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/30 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition hover:border-emerald-500 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/50">
                    <Upload size={18} />
                    Upload
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                  </label>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Upload up to six highlight images (PNG/JPG).</p>
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">5. Amenities</h3>
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
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
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
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  onClick={handleCustomAmenityAdd}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:text-emerald-900"
                >
                  <Plus size={16} /> Add Amenity
                </button>
              </div>
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600">6. Room Status</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">Availability</label>
                  <select
                    value={form.availability}
                    onChange={handleFieldChange("availability")}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
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
                    <p className="text-xs text-gray-500 dark:text-gray-400">Surface this room prominently on the landing page.</p>
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

          <div className="flex w-full flex-col gap-4 overflow-y-auto px-6 pb-8 pt-6 lg:max-w-sm lg:px-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-600 dark:text-gray-400">Summary</h3>
              <div className="rounded-2xl border border-emerald-100 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/30 p-5 text-emerald-900 dark:text-emerald-200">
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-600 dark:text-emerald-400">Preview</p>
                <h4 className="mt-2 text-xl font-bold">{form.name || "Unnamed Room"}</h4>
                <p className="text-sm text-emerald-800 dark:text-emerald-300">{form.type} • {form.maxGuests || 1} Guests • {form.bedType}</p>
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
            </div>
            <div className="mt-auto flex flex-col gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 dark:bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-700/30 dark:shadow-emerald-600/30 transition hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                    Saving Room…
                  </>
                ) : (
                  "Save Room"
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

