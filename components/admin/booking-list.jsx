"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { bookingAdminRequest } from "@/lib/booking-admin-client"
import { getOutstandingPaymentBalance, getRecordedPaymentAmount } from "@/lib/payment-domain.mjs"
import SearchField from "@/components/admin/search-field"

function formatDate(value) {
  if (!value) return "—"
  const date = value?.toDate?.() || new Date(String(value).includes("T") ? value : `${value}T00:00:00`)
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

function formatTimestamp(value) {
  if (!value) return "—"
  const date = value?.toDate?.() || new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export default function BookingList({ isLegacyHelpdesk, ownerUid, invoiceBusiness, history, staffRole = "owner" }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyBookingId, setBusyBookingId] = useState("")
  const [imagePreview, setImagePreview] = useState(null)
  const [search, setSearch] = useState("")

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      if (!history) await bookingAdminRequest("/api/booking/auto-complete", { method: "POST" })
      const result = await bookingAdminRequest(`/api/booking/list${history ? "?history=true" : ""}`)
      setBookings(result.bookings || [])
    } catch (loadError) {
      console.error("Failed to load bookings:", loadError)
      setError(loadError.message || "Bookings could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [history])

  useEffect(() => {
    loadBookings()
  }, [loadBookings, ownerUid, isLegacyHelpdesk])

  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return bookings
    return bookings.filter((booking) =>
      [
        booking.name,
        booking.email,
        booking.phone,
        booking.roomType,
        booking.id,
        booking.status,
        booking.paymentStatus,
        booking.stayStatus,
        booking.checkIn,
        booking.checkOut,
      ].some((value) => String(value || "").toLowerCase().includes(term)),
    )
  }, [bookings, search])

  const updateStatus = async (booking, status) => {
    const cancellation = {}
    if (status === "Cancelled") {
      const cancellationReason = window.prompt("Reason for cancellation:", booking.cancellationReason || "")
      if (cancellationReason === null) return
      const paid = Number(booking.paymentAmount || 0)
      const refundAmount = window.prompt(
        "Manual refund amount (enter 0 if no refund will be issued):",
        String(booking.refundAmount ?? paid),
      )
      if (refundAmount === null) return
      let refundStatus = "not_applicable"
      let refundDate = ""
      if (Number(refundAmount) > 0) {
        refundStatus = window.prompt(
          "Refund status: pending, refunded, or not_refunded",
          booking.refundStatus === "not_applicable" ? "pending" : booking.refundStatus || "pending",
        )
        if (refundStatus === null) return
        if (refundStatus === "refunded") {
          refundDate = window.prompt("Refund date (YYYY-MM-DD):", new Date().toISOString().slice(0, 10))
          if (refundDate === null) return
        }
      }
      cancellation.cancellationReason = cancellationReason
      cancellation.refundAmount = Number(refundAmount)
      cancellation.refundStatus = refundStatus
      cancellation.refundDate = refundDate
      if (!window.confirm("Cancel this booking? Any refund is recorded manually and will not be transferred by the app.")) return
    }

    setBusyBookingId(booking.id)
    try {
      await bookingAdminRequest("/api/booking/update-status", {
        method: "POST",
        body: JSON.stringify({
          bookingId: booking.id,
          currentStatus: booking.status || "Pending",
          status,
          ...cancellation,
        }),
      })
      if (["Declined", "Cancelled", "Completed"].includes(status)) {
        setBookings((current) => current.filter((item) => item.id !== booking.id))
      } else {
        setBookings((current) =>
          current.map((item) => (item.id === booking.id ? { ...item, status } : item)),
        )
      }
      try {
        await bookingAdminRequest("/api/booking/send-status-email", {
          method: "POST",
          body: JSON.stringify({ bookingId: booking.id }),
        })
        toast.success(`Booking ${status.toLowerCase()} and guest notified.`)
      } catch (emailError) {
        toast.error(`Booking updated, but email failed: ${emailError.message}`)
      }
    } catch (updateError) {
      console.error("Failed to update booking:", updateError)
      toast.error(updateError.message || "Booking could not be updated.")
    } finally {
      setBusyBookingId("")
    }
  }

  const updateStayStatus = async (booking, action) => {
    let paymentMethod
    const balanceDue = getOutstandingPaymentBalance(booking)
    if (action === "check-in" && balanceDue > 0) {
      if (typeof window === "undefined") return
      const depositDue = Math.max(
        0,
        Number(booking.reservationDepositAmount ?? booking.totalPrice ?? 0) - getRecordedPaymentAmount(booking),
      )
      if (depositDue > 0) {
        toast.error("Verify or record the reservation deposit before check-in.")
        return
      }
      const method = window.prompt(
        `Collect the remaining balance of ${formatMoney(balanceDue)} before check-in. Enter cash or gcash:`,
        "cash",
      )
      if (method === null) return
      paymentMethod = method.trim().toLowerCase()
      if (!["cash", "gcash"].includes(paymentMethod)) {
        toast.error("Enter cash or gcash to record the check-in balance.")
        return
      }
    }
    setBusyBookingId(booking.id)
    try {
      const result = await bookingAdminRequest("/api/booking/stay-status", {
        method: "POST",
        body: JSON.stringify({ bookingId: booking.id, action, paymentMethod }),
      })
      setBookings((current) =>
        current.map((item) =>
          item.id === booking.id
            ? {
                ...item,
                stayStatus: result.stayStatus,
                ...(action === "check-in" ? { checkedInAt: result.timestamp } : { checkedOutAt: result.timestamp }),
                paymentStatus: result.paymentStatus,
                paymentAmount: result.paymentAmount,
                paymentMethod: result.paymentMethod || item.paymentMethod,
              }
            : item,
        ),
      )
      toast.success(action === "check-in"
        ? result.balancePaid > 0
          ? `Balance of ${formatMoney(result.balancePaid)} recorded; guest checked in.`
          : "Guest checked in."
        : "Guest checked out.")
    } catch (updateError) {
      console.error("Failed to update guest stay status:", updateError)
      toast.error(updateError.message || "Check-in/check-out could not be updated.")
    } finally {
      setBusyBookingId("")
    }
  }

  const sendInvoice = async (bookingId) => {
    setBusyBookingId(bookingId)
    try {
      const result = await bookingAdminRequest("/api/booking/send-invoice", {
        method: "POST",
        body: JSON.stringify({ bookingId, business: invoiceBusiness || {} }),
      })
      toast.success(`Invoice ${result.invoiceId} sent to the guest.`)
    } catch (invoiceError) {
      console.error("Failed to send invoice:", invoiceError)
      toast.error(invoiceError.message || "Invoice could not be sent.")
    } finally {
      setBusyBookingId("")
    }
  }

  const viewBookingImage = async (booking, type) => {
    setBusyBookingId(booking.id)
    try {
      const params = new URLSearchParams({ bookingId: booking.id, type })
      const result = await bookingAdminRequest(`/api/booking/private-image?${params}`)
      setImagePreview({
        src: result.image,
        title: type === "id" ? "Guest valid ID" : "Proof of payment",
      })
    } catch (imageError) {
      console.error("Failed to load booking image:", imageError)
      toast.error(imageError.message || "Booking image could not be loaded.")
    } finally {
      setBusyBookingId("")
    }
  }

  const updatePaymentStatus = async (booking, action) => {
    setBusyBookingId(booking.id)
    try {
      const result = await bookingAdminRequest("/api/booking/update-payment-status", {
        method: "POST",
        body: JSON.stringify({ bookingId: booking.id, action }),
      })
      setBookings((current) =>
        current.map((item) => (item.id === booking.id
          ? { ...item, paymentStatus: result.paymentStatus, paymentAmount: result.paymentAmount }
          : item)),
      )
      toast.success(action === "mark-as-paid"
        ? "Reservation deposit verified; guest notification is queued."
        : "Payment proof rejected; guest notification is queued.")
    } catch (updateError) {
      console.error("Failed to update payment status:", updateError)
      toast.error(updateError.message || "Payment status could not be updated.")
    } finally {
      setBusyBookingId("")
    }
  }

  const resendPaymentEmail = async (booking) => {
    setBusyBookingId(booking.id)
    try {
      await bookingAdminRequest("/api/booking/send-status-email", {
        method: "POST",
        body: JSON.stringify({ bookingId: booking.id, type: "payment" }),
      })
      toast.success("Payment update email sent.")
    } catch (emailError) {
      console.error("Failed to resend payment email:", emailError)
      toast.error(emailError.message || "Payment email could not be sent.")
    } finally {
      setBusyBookingId("")
    }
  }

  return (
    <section className="space-y-6 p-2 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{history ? "Booking History" : "Manage Bookings"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {history ? "Completed, declined, and cancelled booking records." : "Review requests and update booking status."}
          </p>
        </div>
        <button
          type="button"
          onClick={loadBookings}
          disabled={loading}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          Refresh
        </button>
      </header>

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder={history
          ? "Search guest, room, status, or reference"
          : "Search guest, room, email, or reference"}
      />

      {loading ? (
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground" role="status">Loading bookings…</p>
      ) : error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">{error}</p>
      ) : bookings.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {history ? "No booking history yet." : "No active booking requests."}
        </p>
      ) : filteredBookings.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No bookings match “{search}”.
        </p>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => (
            <article key={booking.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{booking.name || "Guest"} · {booking.roomType || "Room"}</h2>
                  <p className="text-sm text-muted-foreground">
                    <a className="underline underline-offset-2" href={`mailto:${booking.email || ""}`}>{booking.email || "No email"}</a>
                    {booking.phone ? ` · ${booking.phone}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Reference: {booking.id}</p>
                </div>
                <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">{booking.status || "Pending"}</span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-muted-foreground">Check-in</dt><dd className="font-medium text-foreground">{formatDate(booking.checkIn)}</dd></div>
                <div><dt className="text-muted-foreground">Check-out</dt><dd className="font-medium text-foreground">{formatDate(booking.checkOut)}</dd></div>
                <div><dt className="text-muted-foreground">Guests</dt><dd className="font-medium text-foreground">{booking.guests || 1}</dd></div>
                <div><dt className="text-muted-foreground">Total</dt><dd className="font-medium text-foreground">{formatMoney(booking.totalPrice)}</dd></div>
                <div>
                  <dt className="text-muted-foreground">Payment</dt>
                  <dd className="font-medium capitalize text-foreground">
                    {(booking.paymentStatus || "unpaid").replaceAll("_", " ")} · {formatMoney(getRecordedPaymentAmount(booking))} paid
                  </dd>
                  {getOutstandingPaymentBalance(booking) > 0 ? (
                    <dd className="text-xs text-amber-700">{formatMoney(getOutstandingPaymentBalance(booking))} due at check-in</dd>
                  ) : null}
                </div>
                <div><dt className="text-muted-foreground">Stay status</dt><dd className="font-medium capitalize text-foreground">{(booking.stayStatus || "not_checked_in").replaceAll("_", " ")}</dd></div>
                <div><dt className="text-muted-foreground">Requested</dt><dd className="font-medium text-foreground">{formatDate(booking.createdAt)}</dd></div>
                {booking.checkedInAt ? <div><dt className="text-muted-foreground">Checked in</dt><dd className="font-medium text-foreground">{formatTimestamp(booking.checkedInAt)}</dd></div> : null}
                {booking.checkedOutAt ? <div><dt className="text-muted-foreground">Checked out</dt><dd className="font-medium text-foreground">{formatTimestamp(booking.checkedOutAt)}</dd></div> : null}
              </dl>

              {booking.status === "Cancelled" ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p><strong>Cancellation:</strong> {booking.cancellationReason || "Not recorded"}</p>
                  <p><strong>Manual refund:</strong> {formatMoney(booking.refundAmount)} · {(booking.refundStatus || "not_applicable").replaceAll("_", " ")}{booking.refundDate ? ` · ${formatDate(booking.refundDate)}` : ""}</p>
                  {booking.refundReason ? <p><strong>Refund reason:</strong> {booking.refundReason}</p> : null}
                  <p className="mt-1 text-xs">No money is transferred by the app.</p>
                </div>
              ) : null}

              {booking.specialRequests ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground"><strong>Requests:</strong> {booking.specialRequests}</p>
              ) : null}
              {booking.hasProofOfPayment || booking.hasValidId ? (
                <div className="mt-4 flex flex-wrap gap-4">
                  {booking.hasProofOfPayment ? (
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => viewBookingImage(booking, "proof")}
                      className="text-sm font-medium text-primary underline disabled:opacity-60"
                    >View proof of payment</button>
                  ) : null}
                  {booking.hasValidId ? (
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => viewBookingImage(booking, "id")}
                      className="text-sm font-medium text-primary underline disabled:opacity-60"
                    >View guest ID</button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {!history &&
                booking.status === "Approved" &&
                ["owner", "admin", "front-desk"].includes(staffRole) &&
                (booking.stayStatus || "not_checked_in") !== "checked_out" ? (
                  <button
                    type="button"
                    disabled={busyBookingId === booking.id}
                    onClick={() => updateStayStatus(booking, booking.stayStatus === "checked_in" ? "check-out" : "check-in")}
                    className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    {booking.stayStatus === "checked_in" ? "Mark checked out" : "Mark checked in"}
                  </button>
                ) : null}
                {!history &&
                !isLegacyHelpdesk &&
                ownerUid &&
                ["owner", "admin", "finance"].includes(staffRole) &&
                booking.paymentStatus === "proof_submitted" ? (
                  <>
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => updatePaymentStatus(booking, "mark-as-paid")}
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                    >Verify reservation deposit</button>
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => updatePaymentStatus(booking, "reject")}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >Reject payment</button>
                  </>
                ) : null}
                {!history && ["paid", "partially_paid", "rejected"].includes(booking.paymentStatus) ? (
                  <button
                    type="button"
                    disabled={busyBookingId === booking.id}
                    onClick={() => resendPaymentEmail(booking)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                  >Resend payment email</button>
                ) : null}
                {!history && booking.status === "Pending" ? (
                  <>
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => updateStatus(booking, "Approved")}
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                    >Approve</button>
                    <button
                      type="button"
                      disabled={busyBookingId === booking.id}
                      onClick={() => updateStatus(booking, "Declined")}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >Decline</button>
                  </>
                ) : null}
                {!history && booking.status === "Approved" ? (
                  <button
                    type="button"
                    disabled={busyBookingId === booking.id}
                    onClick={() => updateStatus(booking, "Cancelled")}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >Cancel booking</button>
                ) : null}
                <button
                  type="button"
                  disabled={busyBookingId === booking.id}
                  onClick={() => sendInvoice(booking.id)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                >{busyBookingId === booking.id ? "Working…" : "Email invoice"}</button>
              </div>
            </article>
          ))}
        </div>
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
    </section>
  )
}
