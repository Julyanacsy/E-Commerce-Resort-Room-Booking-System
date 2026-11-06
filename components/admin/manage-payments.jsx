"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { Download, FileSpreadsheet, Receipt, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { auth, db } from "@/lib/firebase"
import { bookingAdminRequest } from "@/lib/booking-admin-client"

const PAYMENT_FILTERS = [
  { value: "all", label: "All" },
  { value: "proof_submitted", label: "Needs review" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
]

function formatDate(value) {
  if (!value) return "—"
  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}

function formatMoney(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getLocalDate() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function getManilaDateKey(value) {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value || ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function getCurrentManilaMonth() {
  return getManilaDateKey(new Date()).slice(0, 7)
}

const PAYMENT_RECEIPT_ACTIONS = new Set([
  "mark-as-paid",
  "cash-recorded",
  "walk-in-cash-recorded",
  "payment-recorded",
])

export default function ManagePayments({ ownerUid, isLegacyHelpdesk }) {
  const [bookings, setBookings] = useState([])
  const [paymentEvents, setPaymentEvents] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState("")
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyBookingId, setBusyBookingId] = useState("")
  const [filter, setFilter] = useState("all")
  const [activeView, setActiveView] = useState("payments")
  const [historyStartDate, setHistoryStartDate] = useState("")
  const [historyEndDate, setHistoryEndDate] = useState("")
  const [summaryMonth, setSummaryMonth] = useState(getCurrentManilaMonth)
  const [imagePreview, setImagePreview] = useState(null)
  const [walkInSaving, setWalkInSaving] = useState(false)
  const [walkIn, setWalkIn] = useState({
    name: "",
    email: "",
    phone: "",
    roomType: "",
    checkIn: "",
    checkOut: "",
    guests: "1",
    specialRequests: "",
  })

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await bookingAdminRequest("/api/booking/list?payments=true")
      setBookings(result.bookings || [])
    } catch (loadError) {
      console.error("Failed to load payment records:", loadError)
      setError(loadError.message || "Payment records could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPaymentHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError("")
    try {
      const result = await bookingAdminRequest("/api/booking/payment-history")
      setPaymentEvents(result.events || [])
    } catch (loadError) {
      console.error("Failed to load payment history:", loadError)
      setHistoryError(loadError.message || "Payment history could not be loaded.")
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBookings()
    loadPaymentHistory()
  }, [loadBookings, loadPaymentHistory, ownerUid])

  useEffect(() => {
    let active = true
    if (!db || !ownerUid || isLegacyHelpdesk) {
      setRooms([])
      setRoomsLoading(false)
      return undefined
    }

    getDocs(query(collection(db, "rooms"), where("ownerUid", "==", ownerUid)))
      .then((snapshot) => {
        if (!active) return
        const availableRooms = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((room) => !room.availability || room.availability === "Available")
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        setRooms(availableRooms)
      })
      .catch((roomsError) => {
        console.error("Failed to load rooms for walk-in payments:", roomsError)
        if (active) toast.error("Rooms could not be loaded for walk-in bookings.")
      })
      .finally(() => {
        if (active) setRoomsLoading(false)
      })

    return () => {
      active = false
    }
  }, [ownerUid, isLegacyHelpdesk])

  const visibleBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        const paymentStatus = booking.paymentStatus || "unpaid"
        return filter === "all" || paymentStatus === filter
      }),
    [bookings, filter],
  )

  const historyRecords = useMemo(() => {
    const records = [...paymentEvents]
    for (const booking of bookings) {
      const status = booking.paymentStatus || "unpaid"
      if (
        !["paid", "rejected"].includes(status) ||
        !booking.paymentReviewedAt ||
        records.some((event) => event.bookingId === booking.id && event.paymentStatus === status)
      ) {
        continue
      }
      records.push({
        id: `legacy-${booking.id}-${status}`,
        bookingId: booking.id,
        guestName: booking.name || "Guest",
        roomType: booking.roomType || "Room",
        checkIn: booking.checkIn || "",
        checkOut: booking.checkOut || "",
        action: status === "paid" ? "payment-recorded" : "payment-rejected",
        paymentStatus: status,
        paymentMethod: booking.paymentMethod || "gcash",
        amount: Number(booking.paymentAmount ?? booking.totalPrice ?? 0),
        recordedBy: booking.paymentReviewedBy || "",
        createdAt: booking.paymentReviewedAt,
      })
    }
    return records.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
  }, [bookings, paymentEvents])

  const filteredHistoryRecords = useMemo(
    () =>
      historyRecords.filter((record) => {
        const date = getManilaDateKey(record.createdAt)
        return (
          date &&
          (!historyStartDate || date >= historyStartDate) &&
          (!historyEndDate || date <= historyEndDate)
        )
      }),
    [historyEndDate, historyRecords, historyStartDate],
  )

  const monthlyPaymentSummary = useMemo(() => {
    const records = historyRecords.filter(
      (record) =>
        record.paymentStatus === "paid" &&
        PAYMENT_RECEIPT_ACTIONS.has(record.action) &&
        getManilaDateKey(record.createdAt).startsWith(summaryMonth),
    )
    return {
      total: records.reduce((sum, record) => sum + Number(record.amount || 0), 0),
      count: records.length,
      gcash: records
        .filter((record) => record.paymentMethod === "gcash")
        .reduce((sum, record) => sum + Number(record.amount || 0), 0),
      cash: records
        .filter((record) => record.paymentMethod === "cash")
        .reduce((sum, record) => sum + Number(record.amount || 0), 0),
    }
  }, [historyRecords, summaryMonth])

  const downloadInvoice = async (booking) => {
    const user = auth?.currentUser
    if (!user) {
      toast.error("Please sign in again to download an invoice.")
      return
    }
    setBusyBookingId(booking.id)
    try {
      const response = await fetch("/api/booking/download-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ bookingId: booking.id }),
        cache: "no-store",
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || `Invoice download failed (${response.status}).`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `invoice-${booking.id}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success("Invoice downloaded.")
    } catch (downloadError) {
      console.error("Failed to download booking invoice:", downloadError)
      toast.error(downloadError.message || "Invoice could not be downloaded.")
    } finally {
      setBusyBookingId("")
    }
  }

  const exportPaymentHistory = () => {
    if (!filteredHistoryRecords.length) {
      toast.error("There is no payment history to export.")
      return
    }
    const rows = [
      ["Date", "Guest", "Booking reference", "Room", "Check-in", "Check-out", "Action", "Payment status", "Method", "Amount"],
      ...filteredHistoryRecords.map((record) => [
        formatDate(record.createdAt),
        record.guestName,
        record.bookingId,
        record.roomType,
        record.checkIn,
        record.checkOut,
        record.action.replaceAll("-", " "),
        record.paymentStatus.replaceAll("_", " "),
        record.paymentMethod,
        Number(record.amount || 0).toFixed(2),
      ]),
    ]
    const escapeCell = (value) => {
      let text = String(value ?? "")
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
      return `"${text.replaceAll('"', '""')}"`
    }
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}`
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `payment-history-${historyStartDate || "all"}-to-${historyEndDate || getLocalDate()}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success("Excel-compatible payment report downloaded.")
  }

  const updatePayment = async (booking, action) => {
    const actionLabel =
      action === "mark-as-paid" ? "verify the GCash payment" : action === "reject" ? "reject this payment" : "record full cash payment"
    if (typeof window !== "undefined" && !window.confirm(`Are you sure you want to ${actionLabel} for ${booking.name || "this guest"} (${formatMoney(booking.totalPrice)})?`)) {
      return
    }

    setBusyBookingId(booking.id)
    const paymentStatus = action === "reject" ? "rejected" : "paid"
    const paymentMethod = action === "record-cash" ? "cash" : "gcash"
    try {
      await bookingAdminRequest("/api/booking/update-payment-status", {
        method: "POST",
        body: JSON.stringify({ bookingId: booking.id, action }),
      })
      setBookings((current) =>
        current.map((item) =>
          item.id === booking.id ? { ...item, paymentStatus, paymentMethod } : item,
        ),
      )
      await loadPaymentHistory()

      if (!booking.email) {
        toast.success(
          action === "reject"
            ? "Payment proof rejected. This guest has no email address."
            : `${paymentMethod === "cash" ? "Cash payment" : "GCash payment"} recorded; this guest has no email address.`,
        )
        return
      }

      try {
        await bookingAdminRequest("/api/booking/send-status-email", {
          method: "POST",
          body: JSON.stringify({ bookingId: booking.id, type: "payment" }),
        })
        toast.success(
          action === "reject"
            ? "Payment proof rejected and guest notified."
            : `${paymentMethod === "cash" ? "Cash payment" : "GCash payment"} recorded and guest notified.`,
        )
      } catch (emailError) {
        toast.error(`Payment updated, but email failed: ${emailError.message}`)
      }
    } catch (updateError) {
      console.error("Failed to update payment:", updateError)
      toast.error(updateError.message || "Payment could not be updated.")
    } finally {
      setBusyBookingId("")
    }
  }

  const viewImage = async (booking, type) => {
    setBusyBookingId(booking.id)
    try {
      const params = new URLSearchParams({ bookingId: booking.id, type })
      const result = await bookingAdminRequest(`/api/booking/private-image?${params}`)
      setImagePreview({
        src: result.image,
        title: type === "id" ? "Guest valid ID" : "Proof of payment",
      })
    } catch (imageError) {
      console.error("Failed to load payment upload:", imageError)
      toast.error(imageError.message || "Payment image could not be loaded.")
    } finally {
      setBusyBookingId("")
    }
  }

  const createWalkInBooking = async (event) => {
    event.preventDefault()
    if (!walkIn.roomType) {
      toast.error("Select a room for the walk-in booking.")
      return
    }
    if (walkIn.checkIn >= walkIn.checkOut) {
      toast.error("Check-out must be after check-in.")
      return
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm("Create this walk-in booking as approved and fully paid by cash?")
    ) {
      return
    }

    setWalkInSaving(true)
    try {
      const result = await bookingAdminRequest("/api/booking/create-walk-in", {
        method: "POST",
        body: JSON.stringify({ ...walkIn, guests: Number(walkIn.guests) }),
      })
      toast.success(`Walk-in booking recorded. Cash received: ${formatMoney(result.totalPrice)}.`)
      setWalkIn({
        name: "",
        email: "",
        phone: "",
        roomType: "",
        checkIn: "",
        checkOut: "",
        guests: "1",
        specialRequests: "",
      })
      await loadBookings()
      await loadPaymentHistory()
    } catch (createError) {
      console.error("Failed to record walk-in cash booking:", createError)
      toast.error(createError.message || "Walk-in booking could not be saved.")
    } finally {
      setWalkInSaving(false)
    }
  }

  return (
    <div className="mt-10 space-y-6 border-t border-border pt-8">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-[#fff8f1] p-5 sm:p-7">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-800">Resort finance</p>
          <h2 className="text-2xl font-bold text-[#18271e] sm:text-3xl">Payments</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#66736a]">
            Review guest payments, keep a record of every update, and download invoices or reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              loadBookings()
              loadPaymentHistory()
            }}
            disabled={loading || historyLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#d9e3dc] bg-white px-4 py-2.5 text-sm font-semibold text-[#14583f] hover:bg-[#f1f7f2] disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportPaymentHistory}
            disabled={historyLoading || filteredHistoryRecords.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#00634b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004f3b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download Excel (.csv)
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#eee2d5] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b817a]">Payments received</p>
          <p className="mt-2 text-2xl font-bold text-[#14583f]">
            {formatMoney(bookings.filter((booking) => booking.paymentStatus === "paid").reduce(
              (sum, booking) => sum + Number(booking.paymentAmount ?? booking.totalPrice ?? 0),
              0,
            ))}
          </p>
        </div>
        <div className="rounded-2xl border border-[#eee2d5] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b817a]">Paid bookings</p>
          <p className="mt-2 text-2xl font-bold text-[#18271e]">
            {bookings.filter((booking) => booking.paymentStatus === "paid").length}
          </p>
        </div>
        <div className="rounded-2xl border border-[#eee2d5] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b817a]">For review</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">
            {bookings.filter((booking) => booking.paymentStatus === "proof_submitted").length}
          </p>
        </div>
      </div>

      <div className="flex w-fit flex-wrap gap-2 rounded-2xl border border-[#eee2d5] bg-white p-1.5">
        {[
          { value: "payments", label: "Payments" },
          { value: "history", label: `Payment history (${historyRecords.length})` },
        ].map((view) => (
          <button
            key={view.value}
            type="button"
            aria-pressed={activeView === view.value}
            onClick={() => setActiveView(view.value)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeView === view.value
                ? "bg-[#00634b] text-white shadow-sm"
                : "text-[#526257] hover:bg-[#f4f7f3]"
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeView === "payments" ? (
        <>
      {!isLegacyHelpdesk && ownerUid ? (
        <details className="rounded-2xl border border-[#e6ded2] bg-white shadow-sm">
          <summary className="cursor-pointer px-5 py-4 font-semibold text-[#18271e]">
            Add walk-in customer — cash payment
          </summary>
          <form onSubmit={createWalkInBooking} className="grid gap-4 border-t border-[#eee2d5] p-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#18271e]">
              Guest name *
              <input
                required
                maxLength={120}
                value={walkIn.name}
                onChange={(event) => setWalkIn({ ...walkIn, name: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-[#18271e]">
              Room *
              <select
                required
                value={walkIn.roomType}
                onChange={(event) => setWalkIn({ ...walkIn, roomType: event.target.value })}
                disabled={roomsLoading || rooms.length === 0}
                className="mt-1 w-full rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
              >
                <option value="">{roomsLoading ? "Loading rooms…" : "Select a room"}</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.name}>{room.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[#18271e]">
              Email (optional)
              <input
                type="email"
                maxLength={254}
                value={walkIn.email}
                onChange={(event) => setWalkIn({ ...walkIn, email: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-[#18271e]">
              Phone (optional)
              <input
                type="tel"
                maxLength={40}
                value={walkIn.phone}
                onChange={(event) => setWalkIn({ ...walkIn, phone: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-[#18271e]">
              Check-in *
              <input
                type="date"
                required
                min={getLocalDate()}
                value={walkIn.checkIn}
                onChange={(event) => setWalkIn({ ...walkIn, checkIn: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-[#18271e]">
              Check-out *
              <input
                type="date"
                required
                min={walkIn.checkIn || getLocalDate()}
                value={walkIn.checkOut}
                onChange={(event) => setWalkIn({ ...walkIn, checkOut: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-[#18271e]">
              Guests *
              <input
                type="number"
                required
                min="1"
                max="20"
                value={walkIn.guests}
                onChange={(event) => setWalkIn({ ...walkIn, guests: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-[#18271e] sm:col-span-2">
              Notes (optional)
              <textarea
                maxLength={1000}
                rows={2}
                value={walkIn.specialRequests}
                onChange={(event) => setWalkIn({ ...walkIn, specialRequests: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
              />
            </label>
            <div className="sm:col-span-2">
              <p className="mb-3 text-xs text-[#66736a]">
                The server checks availability and calculates the room total. This walk-in reservation is saved as
                approved and fully paid by cash.
              </p>
              <button
                type="submit"
                disabled={walkInSaving || roomsLoading || rooms.length === 0}
                className="rounded-xl bg-[#00634b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#004f3b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {walkInSaving ? "Saving walk-in…" : "Save walk-in and record cash"}
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-label="Filter payment records">
        {PAYMENT_FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              filter === item.value
                ? "border-[#00634b] bg-[#00634b] text-white"
                : "border-[#e6ded2] bg-white text-[#526257] hover:bg-[#f4f7f3]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground" role="status">
          Loading payment records…
        </p>
      ) : error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">{error}</p>
      ) : visibleBookings.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No payment records match this filter.
        </p>
      ) : (
        <div className="space-y-4">
          {visibleBookings.map((booking) => {
            const paymentStatus = booking.paymentStatus || "unpaid"
            const canReviewProof = paymentStatus === "proof_submitted"
            const canRecordCash =
              !isLegacyHelpdesk &&
              ownerUid &&
              !["Completed", "Declined", "Cancelled"].includes(booking.status) &&
              paymentStatus !== "paid"

            return (
              <article key={booking.id} className="rounded-2xl border border-[#eee2d5] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#18271e]">{booking.name || "Walk-in guest"} · {booking.roomType || "Room"}</h3>
                    <p className="text-sm text-[#66736a]">
                      {booking.email || "No email"}{booking.phone ? ` · ${booking.phone}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[#7b817a]">Reference: {booking.id}</p>
                  </div>
                  <span className="rounded-full bg-[#edf5ef] px-3 py-1 text-xs font-semibold capitalize text-[#14583f]">
                    {paymentStatus.replaceAll("_", " ")}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-[#7b817a]">Stay</dt><dd className="font-medium text-[#18271e]">{formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}</dd></div>
                  <div><dt className="text-[#7b817a]">Total</dt><dd className="font-medium text-[#18271e]">{formatMoney(booking.totalPrice)}</dd></div>
                  <div><dt className="text-[#7b817a]">Method</dt><dd className="font-medium capitalize text-[#18271e]">{booking.paymentMethod || "—"}</dd></div>
                  <div><dt className="text-[#7b817a]">Booking</dt><dd className="font-medium text-[#18271e]">{booking.status || "Pending"}</dd></div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-3">
                  {booking.hasProofOfPayment ? (
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => viewImage(booking, "proof")}
                      className="text-sm font-medium text-primary underline disabled:opacity-60"
                    >View payment proof</button>
                  ) : null}
                  {booking.hasValidId ? (
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => viewImage(booking, "id")}
                      className="text-sm font-medium text-primary underline disabled:opacity-60"
                    >View guest ID</button>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {canReviewProof ? (
                    <>
                      <button
                        type="button"
                        disabled={busyBookingId === booking.id || !booking.hasValidId}
                        onClick={() => updatePayment(booking, "mark-as-paid")}
                        className="rounded-xl bg-[#00634b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004f3b] disabled:opacity-60"
                      >Mark GCash as paid</button>
                      <button
                        type="button"
                        disabled={busyBookingId === booking.id}
                        onClick={() => updatePayment(booking, "reject")}
                        className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >Reject proof</button>
                    </>
                  ) : null}
                  {canRecordCash ? (
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => updatePayment(booking, "record-cash")}
                      className="rounded-xl border border-[#00634b] px-4 py-2 text-sm font-semibold text-[#14583f] hover:bg-[#f1f7f2] disabled:opacity-60"
                    >Record cash received</button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyBookingId === booking.id}
                    onClick={() => downloadInvoice(booking)}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#d9e3dc] px-4 py-2 text-sm font-semibold text-[#14583f] hover:bg-[#f1f7f2] disabled:opacity-60"
                  >
                    <Receipt className="h-4 w-4" />
                    {busyBookingId === booking.id ? "Preparing…" : "Download invoice"}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
        </>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#eee2d5] bg-white p-5">
            <div>
              <h3 className="text-lg font-bold text-[#18271e]">Payment history</h3>
              <p className="mt-1 text-sm text-[#66736a]">
                A dated audit of payment proof, GCash verification, cash receipts, and walk-in payments.
              </p>
            </div>
            <button
              type="button"
              onClick={exportPaymentHistory}
              disabled={historyLoading || historyRecords.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#00634b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004f3b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export Excel (.csv)
            </button>
          </div>
          {historyLoading ? (
            <p className="rounded-2xl border border-[#eee2d5] bg-white p-5 text-sm text-[#66736a]" role="status">
              Loading payment history…
            </p>
          ) : historyError ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">
              {historyError}
            </p>
          ) : (
            <div className="space-y-4">
              <section className="space-y-4 rounded-2xl border border-[#dbe7dc] bg-[#f4f8f2] p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#66736a]">Monthly summary</p>
                    <p className="mt-1 text-sm text-[#66736a]">
                      Paid transactions only; pending proofs and rejected payments are excluded.
                    </p>
                  </div>
                  <label className="text-sm font-semibold text-[#18271e]">
                    Month
                    <input
                      type="month"
                      value={summaryMonth}
                      onChange={(event) => setSummaryMonth(event.target.value || getCurrentManilaMonth())}
                      className="ml-2 rounded-lg border border-[#d9e3dc] bg-white px-3 py-2"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-[#e4eadf] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b817a]">Total received</p>
                    <p className="mt-2 text-xl font-bold text-[#14583f]">{formatMoney(monthlyPaymentSummary.total)}</p>
                  </div>
                  <div className="rounded-xl border border-[#e4eadf] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b817a]">Transactions</p>
                    <p className="mt-2 text-xl font-bold text-[#18271e]">{monthlyPaymentSummary.count}</p>
                  </div>
                  <div className="rounded-xl border border-[#e4eadf] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b817a]">GCash received</p>
                    <p className="mt-2 text-xl font-bold text-[#14583f]">{formatMoney(monthlyPaymentSummary.gcash)}</p>
                  </div>
                  <div className="rounded-xl border border-[#e4eadf] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b817a]">Cash received</p>
                    <p className="mt-2 text-xl font-bold text-[#14583f]">{formatMoney(monthlyPaymentSummary.cash)}</p>
                  </div>
                </div>
              </section>

              <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#eee2d5] bg-white p-4">
                <label className="text-sm font-semibold text-[#18271e]">
                  From
                  <input
                    type="date"
                    value={historyStartDate}
                    max={historyEndDate || undefined}
                    onChange={(event) => setHistoryStartDate(event.target.value)}
                    className="mt-1 block rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
                  />
                </label>
                <label className="text-sm font-semibold text-[#18271e]">
                  To
                  <input
                    type="date"
                    value={historyEndDate}
                    min={historyStartDate || undefined}
                    onChange={(event) => setHistoryEndDate(event.target.value)}
                    className="mt-1 block rounded-lg border border-[#e6ded2] bg-[#fffaf5] px-3 py-2"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryStartDate("")
                    setHistoryEndDate("")
                  }}
                  disabled={!historyStartDate && !historyEndDate}
                  className="rounded-xl border border-[#d9e3dc] px-4 py-2.5 text-sm font-semibold text-[#14583f] hover:bg-[#f1f7f2] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear dates
                </button>
                <p className="ml-auto pb-2 text-sm text-[#66736a]">
                  {filteredHistoryRecords.length} of {historyRecords.length} activities
                </p>
              </div>

              {filteredHistoryRecords.length === 0 ? (
                <p className="rounded-2xl border border-[#eee2d5] bg-white p-6 text-sm text-[#66736a]">
                  {historyRecords.length === 0
                    ? "No payment activity has been recorded yet."
                    : "No payment activity matches the selected dates."}
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-[#eee2d5] bg-white shadow-sm">
                  <div className="hidden grid-cols-[1.2fr_1.2fr_1.3fr_1fr_1fr] gap-4 bg-[#f7f2eb] px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#66736a] md:grid">
                    <span>Date</span><span>Guest</span><span>Activity</span><span>Method</span><span className="text-right">Amount</span>
                  </div>
                  <div className="divide-y divide-[#eee2d5]">
                    {filteredHistoryRecords.map((record) => (
                      <article key={record.id} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[1.2fr_1.2fr_1.3fr_1fr_1fr] md:items-center md:gap-4">
                        <div className="text-[#66736a]">{formatDate(record.createdAt)}</div>
                        <div>
                          <p className="font-semibold text-[#18271e]">{record.guestName || "Guest"}</p>
                          <p className="text-xs text-[#7b817a]">{record.bookingId}</p>
                        </div>
                        <div>
                          <p className="font-medium capitalize text-[#18271e]">{record.action.replaceAll("-", " ")}</p>
                          <p className="text-xs capitalize text-[#7b817a]">{record.paymentStatus.replaceAll("_", " ")}</p>
                        </div>
                        <div className="capitalize text-[#526257]">{record.paymentMethod || "—"}</div>
                        <div className="font-semibold text-[#14583f] md:text-right">{formatMoney(record.amount)}</div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {imagePreview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={imagePreview.title}
          onClick={() => setImagePreview(null)}
        >
          <div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="mb-3 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              Close
            </button>
            <img
              src={imagePreview.src}
              alt={imagePreview.title}
              className="max-h-[80vh] max-w-full rounded-lg bg-white object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
