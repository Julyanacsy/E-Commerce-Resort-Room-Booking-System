"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ClipboardCheck,
  Package,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { resortAdminRequest } from "@/lib/admin-api-client"
import { getInspectionFindings } from "@/lib/room-inspection-domain.mjs"
import SearchField from "@/components/admin/search-field"

const EMPTY_FORM = {
  roomId: "",
  name: "",
  category: "",
  itemType: "supply",
  expectedQuantity: "",
}

const CONDITIONS = [
  { value: "good", label: "Good" },
  { value: "damaged", label: "Damaged" },
  { value: "missing", label: "Missing" },
]

function formatBooking(booking) {
  return `${booking.name} · ${booking.roomType} · ${booking.checkIn} to ${booking.checkOut}`
}

export default function RoomItemMonitoring({ canManageItems }) {
  const [rooms, setRooms] = useState([])
  const [roomItems, setRoomItems] = useState([])
  const [bookings, setBookings] = useState([])
  const [inspections, setInspections] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState("items")
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [selectedBookingId, setSelectedBookingId] = useState("")
  const [inspectionForm, setInspectionForm] = useState([])
  const [inspectionSaving, setInspectionSaving] = useState(false)
  const [search, setSearch] = useState("")

  const loadMonitoring = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await resortAdminRequest("/api/resort/room-inventory", undefined, "GET")
      if (
        !Array.isArray(result.rooms)
        || !Array.isArray(result.roomItems)
        || !Array.isArray(result.bookings)
        || !result.inspections
      ) {
        throw new Error("The room inventory service returned invalid data.")
      }
      setRooms(result.rooms)
      setRoomItems(result.roomItems)
      setBookings(result.bookings)
      setInspections(result.inspections)
    } catch (loadError) {
      console.error("Failed to load room item monitoring:", loadError)
      setError(loadError.message || "Room item monitoring could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMonitoring()
  }, [loadMonitoring])

  const activeItems = useMemo(
    () => roomItems.filter((item) => item.isArchived !== true),
    [roomItems],
  )
  const visibleItems = showArchived
    ? roomItems.filter((item) => item.isArchived === true)
    : activeItems
  const filteredVisibleItems = visibleItems.filter((item) => {
    const roomName = rooms.find((room) => room.id === item.roomId)?.name || ""
    return [item.name, item.category, item.itemType, roomName]
      .some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase()))
  })
  const filteredBookings = bookings.filter((booking) =>
    [booking.name, booking.email, booking.phone, booking.roomType, booking.checkIn, booking.checkOut, booking.id]
      .some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())),
  )
  const selectedBooking = bookings.find((booking) => booking.id === selectedBookingId) || null
  const selectedInspection = selectedBooking ? inspections[selectedBooking.id] : null
  const inspectionPhase = selectedBooking?.stayStatus === "checked_out"
    ? "postCheckOut"
    : selectedBooking?.stayStatus === "not_checked_in"
      ? "preCheckIn"
      : null
  const selectedRoomItems = useMemo(
    () => selectedBooking
      ? activeItems.filter((item) => item.roomId === selectedBooking.roomId)
      : [],
    [activeItems, selectedBooking],
  )
  const postCheckoutItems = selectedInspection?.postCheckOut?.items || []
  const findings = getInspectionFindings(postCheckoutItems)
  const unresolvedFindings = findings.filter((finding) =>
    !postCheckoutItems.find((item) => item.itemId === finding.itemId)?.resolvedAt,
  )

  useEffect(() => {
    if (!selectedBooking || !inspectionPhase) {
      setInspectionForm([])
      return
    }
    const savedItems = selectedInspection?.[inspectionPhase]?.items || []
    setInspectionForm(selectedRoomItems.map((item) => {
      const saved = savedItems.find((entry) => entry.itemId === item.id)
      return {
        itemId: item.id,
        quantity: String(saved?.quantity ?? item.expectedQuantity),
        condition: saved?.condition || "good",
        note: saved?.note || "",
      }
    }))
  }, [selectedBookingId, inspectionPhase, selectedInspection, selectedRoomItems])

  const resetItemForm = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, roomId: rooms[0]?.id || "" })
  }

  const saveItem = async (event) => {
    event.preventDefault()
    const expectedQuantity = Number(form.expectedQuantity)
    if (!Number.isInteger(expectedQuantity) || expectedQuantity < 1 || expectedQuantity > 1000) {
      toast.error("Expected quantity must be a whole number between 1 and 1,000.")
      return
    }
    setSaving(true)
    try {
      await resortAdminRequest("/api/resort/room-inventory", {
        action: editingId ? "item.update" : "item.create",
        ...(editingId ? { itemId: editingId } : {}),
        roomId: form.roomId,
        item: {
          name: form.name,
          category: form.category,
          itemType: form.itemType,
          expectedQuantity,
        },
      })
      toast.success(editingId ? "Room item updated." : "Room item added.")
      resetItemForm()
      await loadMonitoring()
    } catch (saveError) {
      console.error("Failed to save room item:", saveError)
      toast.error(saveError.message || "Room item could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const toggleItemArchive = async (item, action) => {
    try {
      await resortAdminRequest("/api/resort/room-inventory", {
        action: `item.${action}`,
        itemId: item.id,
        roomId: item.roomId,
      })
      toast.success(action === "archive" ? "Room item archived." : "Room item restored.")
      if (editingId === item.id) resetItemForm()
      await loadMonitoring()
    } catch (archiveError) {
      console.error("Failed to update room item archive status:", archiveError)
      toast.error(archiveError.message || "Room item could not be updated.")
    }
  }

  const startEditing = (item) => {
    setEditingId(item.id)
    setForm({
      roomId: item.roomId,
      name: item.name,
      category: item.category,
      itemType: item.itemType,
      expectedQuantity: String(item.expectedQuantity),
    })
  }

  const submitInspection = async (event) => {
    event.preventDefault()
    if (!selectedBooking || !inspectionPhase) return
    setInspectionSaving(true)
    try {
      await resortAdminRequest("/api/resort/room-inventory", {
        action: inspectionPhase === "preCheckIn"
          ? "inspection.pre-check-in"
          : "inspection.post-check-out",
        bookingId: selectedBooking.id,
        items: inspectionForm.map((entry) => ({
          itemId: entry.itemId,
          quantity: Number(entry.quantity),
          condition: entry.condition,
          note: entry.note,
        })),
      })
      toast.success(inspectionPhase === "preCheckIn"
        ? "Pre-check-in room inspection recorded."
        : "Post-checkout room inspection recorded.")
      await loadMonitoring()
    } catch (inspectionError) {
      console.error("Failed to save room inspection:", inspectionError)
      toast.error(inspectionError.message || "Room inspection could not be saved.")
    } finally {
      setInspectionSaving(false)
    }
  }

  const resolveFinding = async (finding) => {
    try {
      await resortAdminRequest("/api/resort/room-inventory", {
        action: "inspection.resolve",
        bookingId: selectedBooking.id,
        itemId: finding.itemId,
        quantityRestocked: finding.restockQuantity,
      })
      toast.success(`${finding.name} marked as replenished or replaced.`)
      await loadMonitoring()
    } catch (resolveError) {
      console.error("Failed to resolve room item need:", resolveError)
      toast.error(resolveError.message || "The room item update could not be recorded.")
    }
  }

  return (
    <section className="space-y-6 p-2 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-foreground">Room Item Monitoring</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track supplies and appliances in each room before check-in and after checkout.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border" role="tablist" aria-label="Room monitoring sections">
        {[
          ["items", "Items per room", Package],
          ["inspections", "Stay inspections", ClipboardCheck],
        ].map(([value, label, Icon]) => (
          <button
            key={value}
            id={`room-monitoring-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={`room-monitoring-panel-${value}`}
            onClick={() => {
              setTab(value)
              setSearch("")
            }}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${
              tab === value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error} <button type="button" onClick={loadMonitoring} className="font-semibold underline">Try again</button>
        </div>
      ) : loading ? (
        <p role="status" className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Loading room monitoring…</p>
      ) : rooms.length === 0 ? (
        <p className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">No active rooms found for this resort.</p>
      ) : tab === "items" ? (
        <div id="room-monitoring-panel-items" role="tabpanel" aria-labelledby="room-monitoring-tab-items" className="space-y-5">
          <SearchField value={search} onChange={setSearch} placeholder="Search item, category, or room" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Set the expected stock and condition for each room.</p>
            <button type="button" onClick={() => { setShowArchived((value) => !value); resetItemForm() }} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline">
              {showArchived ? (
                <><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</>
              ) : (
                <><Archive className="h-4 w-4" aria-hidden="true" /> Archived</>
              )}
            </button>
          </div>

          {canManageItems && !showArchived && (
            <form onSubmit={saveItem} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-foreground">{editingId ? "Edit room item" : "Add item to a room"}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-1 text-sm font-medium text-foreground">
                  Room
                  <select required value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal">
                    <option value="">Select a room</option>
                    {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-foreground">
                  Item name
                  <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Bath towel" className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" />
                </label>
                <label className="space-y-1 text-sm font-medium text-foreground">
                  Category
                  <input required maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Bathroom" className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" />
                </label>
                <label className="space-y-1 text-sm font-medium text-foreground">
                  Item kind
                  <select required value={form.itemType} onChange={(event) => setForm({ ...form, itemType: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal">
                    <option value="supply">Supply / refill</option>
                    <option value="appliance">Appliance / equipment</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-foreground">
                  Expected quantity
                  <input required type="number" min="1" max="1000" step="1" value={form.expectedQuantity} onChange={(event) => setForm({ ...form, expectedQuantity: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                  <Save className="h-4 w-4" aria-hidden="true" /> {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
                </button>
                {editingId && <button type="button" onClick={resetItemForm} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold"><X className="h-4 w-4" aria-hidden="true" /> Cancel</button>}
              </div>
            </form>
          )}

          {filteredVisibleItems.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {search
                ? `No room items match “${search}”.`
                : showArchived
                  ? "No archived room items."
                  : "No room items added yet."}
            </p>
          ) : (
            <div className="space-y-5">
              {rooms.map((room) => {
                const roomRows = filteredVisibleItems.filter((item) => item.roomId === room.id)
                if (!roomRows.length) return null
                return (
                  <section key={room.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <h2 className="border-b border-border px-5 py-4 text-lg font-semibold text-foreground">{room.name}</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-5 py-3 font-medium">Item</th>
                            <th scope="col" className="px-5 py-3 font-medium">Category</th>
                            <th scope="col" className="px-5 py-3 font-medium">Type</th>
                            <th scope="col" className="px-5 py-3 font-medium">Expected</th>
                            <th scope="col" className="px-5 py-3 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {roomRows.map((item) => (
                            <tr key={item.id}>
                              <td className="px-5 py-4 font-medium text-foreground">{item.name}</td>
                              <td className="px-5 py-4 text-muted-foreground">{item.category}</td>
                              <td className="px-5 py-4 text-muted-foreground">{item.itemType === "appliance" ? "Appliance" : "Supply"}</td>
                              <td className="px-5 py-4 text-foreground">{item.expectedQuantity}</td>
                              <td className="px-5 py-4">
                                <div className="flex justify-end gap-2">
                                  {showArchived ? (
                                    <button type="button" onClick={() => toggleItemArchive(item, "restore")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold"><ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> Restore</button>
                                  ) : canManageItems && (
                                    <>
                                      <button type="button" onClick={() => startEditing(item)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</button>
                                      <button type="button" onClick={() => toggleItemArchive(item, "archive")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"><Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive</button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div id="room-monitoring-panel-inspections" role="tabpanel" aria-labelledby="room-monitoring-tab-inspections" className="grid gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
          <SearchField value={search} onChange={setSearch} placeholder="Search guest, room, or booking" className="xl:col-span-2" />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Approved stays</h2>
            {bookings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No approved stays available for inspection.</p>
            ) : filteredBookings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No stays match “{search}”.</p>
            ) : filteredBookings.map((booking) => {
              const status = booking.stayStatus || "not_checked_in"
              const inspection = inspections[booking.id]
              const statusLabel = status === "checked_out"
                ? inspection?.postCheckOut ? "Checkout inspected" : "Checkout check needed"
                : status === "checked_in"
                  ? "Checked in"
                  : inspection?.preCheckIn ? "Pre-check-in inspected" : "Check-in check needed"
              return (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => setSelectedBookingId(booking.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedBookingId === booking.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  <span className="block font-semibold text-foreground">{booking.name} · {booking.roomType}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{booking.checkIn} to {booking.checkOut}</span>
                  <span className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
                    status === "checked_out" && !inspection?.postCheckOut
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground"
                  }`}>
                    {status === "checked_out" && !inspection?.postCheckOut && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                    {statusLabel}
                  </span>
                </button>
              )
            })}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            {!selectedBooking ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Select an approved stay to view or record its room checks.</p>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-foreground">{formatBooking(selectedBooking)}</h2>
                {inspectionPhase && selectedRoomItems.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {inspectionPhase === "preCheckIn"
                        ? "Record the condition and quantity of every active room item before check-in."
                        : "Record the condition and quantity after checkout. Refill and replacement needs will be calculated."}
                    </p>
                    <form onSubmit={submitInspection} className="mt-5 space-y-4">
                      {selectedRoomItems.map((item) => {
                        const row = inspectionForm.find((entry) => entry.itemId === item.id)
                        if (!row) return null
                        return (
                          <fieldset key={item.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[minmax(0,1fr)_110px_150px]">
                            <legend className="sr-only">{item.name}</legend>
                            <div>
                              <p className="font-semibold text-foreground">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{item.category} · {item.itemType === "appliance" ? "Appliance" : "Supply"} · expected {item.expectedQuantity}</p>
                              <label className="mt-2 block text-xs font-medium text-muted-foreground">
                                Note
                                <input
                                  maxLength={300}
                                  value={row.note}
                                  onChange={(event) => setInspectionForm((current) => current.map((entry) => entry.itemId === item.id ? { ...entry, note: event.target.value } : entry))}
                                  placeholder="Optional"
                                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground"
                                />
                              </label>
                            </div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Count found
                              <input
                                required
                                type="number"
                                min="0"
                                max={item.expectedQuantity}
                                step="1"
                                value={row.quantity}
                                onChange={(event) => setInspectionForm((current) => current.map((entry) => entry.itemId === item.id ? { ...entry, quantity: event.target.value } : entry))}
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground"
                              />
                            </label>
                            <label className="text-xs font-medium text-muted-foreground">
                              Condition
                              <select
                                value={row.condition}
                                onChange={(event) => setInspectionForm((current) => current.map((entry) => entry.itemId === item.id ? { ...entry, condition: event.target.value } : entry))}
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground"
                              >
                                {CONDITIONS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
                              </select>
                            </label>
                          </fieldset>
                        )
                      })}
                      <button type="submit" disabled={inspectionSaving || selectedRoomItems.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                        {inspectionSaving ? "Saving…" : inspectionPhase === "preCheckIn" ? "Record pre-check-in" : "Record post-checkout"}
                      </button>
                    </form>
                  </>
                ) : selectedBooking.stayStatus === "checked_in" ? (
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    {selectedInspection?.preCheckIn
                      ? `Pre-check-in inspection recorded on ${new Date(selectedInspection.preCheckIn.inspectedAt).toLocaleString()}. Record the next inspection after checkout.`
                      : "The guest is checked in. Record the pre-check-in inspection from the booking before check-in; the post-checkout inspection will be available after checkout."}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                    No active items are set up for this room. Add room items in the Items per room tab first.
                  </div>
                )}

                {selectedInspection?.preCheckIn && (
                  <div className="mt-5 rounded-lg border border-border p-4">
                    <h3 className="font-semibold text-foreground">Pre-check-in record</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedInspection.preCheckIn.inspectedAt
                        ? new Date(selectedInspection.preCheckIn.inspectedAt).toLocaleString()
                        : "Inspection recorded"}
                    </p>
                    <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {selectedInspection.preCheckIn.items.map((item) => (
                        <li key={item.itemId}>{item.name}: {item.quantity}/{item.expectedQuantity} · {item.condition}{item.note ? ` · ${item.note}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedInspection?.postCheckOut && (
                  <div className="mt-5 rounded-lg border border-border p-4">
                    <h3 className="font-semibold text-foreground">Post-checkout record and room needs</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedInspection.postCheckOut.inspectedAt
                        ? new Date(selectedInspection.postCheckOut.inspectedAt).toLocaleString()
                        : "Inspection recorded"}
                    </p>
                    <ul className="mt-3 space-y-3">
                      {postCheckoutItems.map((item) => {
                        const finding = findings.find((entry) => entry.itemId === item.itemId)
                        return (
                          <li key={item.itemId} className="rounded-md bg-muted/30 p-3 text-sm">
                            <p className="font-medium text-foreground">{item.name}: {item.quantity}/{item.expectedQuantity} · {item.condition}</p>
                            {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
                            {finding ? (
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                  {finding.restockQuantity > 0 ? `Refill ${finding.restockQuantity}` : ""}
                                  {finding.restockQuantity > 0 && finding.needsReplacement ? " · " : ""}
                                  {finding.needsReplacement ? "Repair or replace" : ""}
                                  {item.resolvedAt ? ` · Resolved${item.quantityRestocked ? ` (refilled ${item.quantityRestocked})` : ""}` : ""}
                                </p>
                                {!item.resolvedAt && (
                                  <button type="button" onClick={() => resolveFinding(finding)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-background">
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Mark refilled/replaced
                                  </button>
                                )}
                              </div>
                            ) : <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">No refill or replacement needed.</p>}
                          </li>
                        )
                      })}
                    </ul>
                    {findings.length === 0 && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">Everything is ready for the next guest.</p>}
                    {unresolvedFindings.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{unresolvedFindings.length} room item need(s) still need attention.</p>}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
