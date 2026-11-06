"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Banknote, BedDouble, CalendarCheck, Clock3, RefreshCw } from "lucide-react"
import { bookingAdminRequest } from "@/lib/booking-admin-client"

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  if (typeof value === "object") {
    const seconds = Number(value.seconds ?? value._seconds)
    if (Number.isFinite(seconds)) return new Date(seconds * 1000)
    if (typeof value.toDate === "function") return value.toDate()
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = toDate(value)
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date) : "—"
}

function formatMoney(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function getPaidAmount(booking) {
  const amount = Number(booking.paidAmount ?? booking.totalPrice ?? 0)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export default function AdminOverview({
  isLegacyHelpdesk,
  ownerUid,
  rooms = [],
  roomsLoading = false,
  roomsError = "",
}) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [activeResult, historyResult] = await Promise.all([
        bookingAdminRequest("/api/booking/list"),
        bookingAdminRequest("/api/booking/list?history=true"),
      ])
      if (!Array.isArray(activeResult.bookings) || !Array.isArray(historyResult.bookings)) {
        throw new Error("The booking service returned an invalid response.")
      }
      setBookings([...activeResult.bookings, ...historyResult.bookings])
    } catch (loadError) {
      console.error("Failed to load dashboard bookings:", loadError)
      setError(loadError.message || "Dashboard booking data could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBookings()
  }, [loadBookings, isLegacyHelpdesk, ownerUid])

  const activeBookings = bookings.filter(
    (booking) => !["Completed", "Declined", "Cancelled"].includes(String(booking.status || "")),
  )
  const pendingBookings = activeBookings.filter((booking) => booking.status === "Pending")
  const paidBookings = bookings.filter(
    (booking) => String(booking.paymentStatus || "").toLowerCase() === "paid",
  )
  const paidRevenue = paidBookings.reduce((total, booking) => total + getPaidAmount(booking), 0)

  const monthlyRevenue = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
      return {
        key: getMonthKey(date),
        label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date),
        amount: 0,
      }
    })
    const amountsByMonth = new Map(months.map((month) => [month.key, 0]))

    for (const booking of paidBookings) {
      const paidAt = toDate(booking.paidAt)
      if (!paidAt) continue
      const key = getMonthKey(paidAt)
      if (amountsByMonth.has(key)) {
        amountsByMonth.set(key, amountsByMonth.get(key) + getPaidAmount(booking))
      }
    }

    return months.map((month) => ({ ...month, amount: amountsByMonth.get(month.key) || 0 }))
  }, [paidBookings])

  const maxMonthlyRevenue = Math.max(...monthlyRevenue.map((month) => month.amount), 0)
  const recentBookings = [...bookings]
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
    .slice(0, 6)

  const metrics = [
    { label: "Rooms", value: rooms.length.toLocaleString(), detail: "Your room listings", icon: BedDouble },
    { label: "Active bookings", value: activeBookings.length.toLocaleString(), detail: "Pending or approved", icon: CalendarCheck },
    { label: "Pending requests", value: pendingBookings.length.toLocaleString(), detail: "Awaiting your review", icon: Clock3 },
    { label: "Paid revenue", value: formatMoney(paidRevenue), detail: `${paidBookings.length} paid bookings`, icon: Banknote },
  ]

  return (
    <section className="space-y-6 p-2 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">A snapshot of your rooms, bookings, and payments.</p>
        </div>
        <button
          type="button"
          onClick={loadBookings}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
          <p>{error}</p>
          <button type="button" onClick={loadBookings} className="font-semibold underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : null}
      {roomsError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
          Room data could not be loaded: {roomsError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <article key={label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {label === "Rooms" && roomsLoading ? "…" : loading && label !== "Rooms" ? "…" : value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
              </div>
              <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="revenue-heading">
          <div className="mb-6">
            <h2 id="revenue-heading" className="text-lg font-semibold text-foreground">Paid revenue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Monthly payments received over the last six months.</p>
          </div>
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground" role="status">Loading revenue…</p>
          ) : error ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Revenue is unavailable until bookings load.</p>
          ) : (
            <div className="flex h-48 items-end gap-3 border-b border-border px-2" role="img" aria-label="Monthly paid revenue for the last six months">
              {monthlyRevenue.map((month) => {
                const height = maxMonthlyRevenue > 0 ? Math.max(6, (month.amount / maxMonthlyRevenue) * 100) : 0
                return (
                  <div key={month.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <span className="truncate text-[11px] text-muted-foreground">
                      {month.amount > 0 ? formatMoney(month.amount) : ""}
                    </span>
                    <div className="flex h-[72%] w-full items-end justify-center">
                      <div
                        className="w-full max-w-12 rounded-t-md bg-primary/80"
                        style={{ height: `${height}%` }}
                        title={`${month.label}: ${formatMoney(month.amount)}`}
                      />
                    </div>
                    <span className="pb-2 text-xs text-muted-foreground">{month.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="recent-bookings-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="recent-bookings-heading" className="text-lg font-semibold text-foreground">Recent bookings</h2>
              <p className="mt-1 text-sm text-muted-foreground">Your latest guest requests and reservations.</p>
            </div>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading bookings…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Recent bookings are unavailable.</p>
          ) : recentBookings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentBookings.map((booking) => (
                <li key={booking.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{booking.name || "Guest"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {booking.roomType || "Room"} · {formatDate(booking.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">{formatMoney(booking.totalPrice)}</p>
                    <p className="text-xs text-muted-foreground">{booking.status || "Pending"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}
