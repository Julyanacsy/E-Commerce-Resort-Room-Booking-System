"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { bookingAdminRequest } from "@/lib/booking-admin-client"

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

export default function BookingList({ isLegacyHelpdesk, ownerUid, invoiceBusiness, history }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyBookingId, setBusyBookingId] = useState("")

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

  const updateStatus = async (booking, status) => {
    setBusyBookingId(booking.id)
    try {
      await bookingAdminRequest("/api/booking/update-status", {
        method: "POST",
        body: JSON.stringify({
          bookingId: booking.id,
          currentStatus: booking.status || "Pending",
          status,
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

      {loading ? (
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground" role="status">Loading bookings…</p>
      ) : error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">{error}</p>
      ) : bookings.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {history ? "No booking history yet." : "No active booking requests."}
        </p>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
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
                <div><dt className="text-muted-foreground">Payment</dt><dd className="font-medium text-foreground">{booking.paymentStatus || "unpaid"}</dd></div>
                <div><dt className="text-muted-foreground">Requested</dt><dd className="font-medium text-foreground">{formatDate(booking.createdAt)}</dd></div>
              </dl>

              {booking.specialRequests ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground"><strong>Requests:</strong> {booking.specialRequests}</p>
              ) : null}
              {booking.proofOfPaymentUrl || booking.validIdUrl ? (
                <div className="mt-4 flex flex-wrap gap-4">
                  {booking.proofOfPaymentUrl ? (
                    <a href={booking.proofOfPaymentUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline">View proof of payment</a>
                  ) : null}
                  {booking.validIdUrl ? (
                    <a href={booking.validIdUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline">View guest ID</a>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
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
    </section>
  )
}
