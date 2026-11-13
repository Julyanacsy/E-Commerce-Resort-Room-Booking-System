"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { bookingAdminRequest } from "@/lib/booking-admin-client"
import SearchField from "@/components/admin/search-field"

function localMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export default function BookingCalendar() {
  const [month, setMonth] = useState(localMonth)
  const [rooms, setRooms] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  const loadCalendar = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await bookingAdminRequest(`/api/booking/calendar?month=${encodeURIComponent(month)}`)
      setRooms(result.rooms || [])
      setBookings(result.bookings || [])
    } catch (loadError) {
      console.error("Failed to load booking calendar:", loadError)
      setError(loadError.message || "Booking calendar could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    loadCalendar()
  }, [loadCalendar])

  const days = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number)
    const daysInMonth = new Date(year, monthNumber, 0).getDate()
    const firstWeekday = new Date(year, monthNumber - 1, 1).getDay()
    return [
      ...Array(firstWeekday).fill(null),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1
        const key = dateKey(year, monthNumber - 1, day)
        const active = bookings.filter(
          (booking) =>
            booking.checkIn <= key &&
            booking.checkOut > key &&
            ["Pending", "Approved"].includes(booking.status),
        )
        const matching = search.trim()
          ? active.filter((booking) =>
            [booking.name, booking.email, booking.phone, booking.roomType, booking.id]
              .some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())),
          )
          : active
        return {
          day,
          key,
          bookings: matching,
          availableRooms: Math.max(0, rooms.length - new Set(active.map((booking) => booking.roomType)).size),
        }
      }),
    ]
  }, [bookings, month, rooms.length, search])

  const moveMonth = (amount) => {
    const [year, monthNumber] = month.split("-").map(Number)
    const next = new Date(year, monthNumber - 1 + amount, 1)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`)
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Booking Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Room availability and stays by date.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card p-1 shadow-sm">
          <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || localMonth())}
            aria-label="Calendar month"
            className="h-8 min-w-0 rounded-lg border-0 bg-transparent px-1.5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <button type="button" aria-label="Refresh calendar" title="Refresh calendar" onClick={loadCalendar} disabled={loading} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      <SearchField value={search} onChange={setSearch} placeholder="Search guest, room, or booking" className="max-w-xs" />

      {loading ? (
        <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading calendar…</p>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</p>
      ) : rooms.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Add rooms to see their availability here.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <div className="grid min-w-[700px] grid-cols-7 gap-px border-b border-border bg-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <div key={weekday} className="bg-muted/50 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{weekday}</div>
            ))}
          </div>
          <div className="grid min-w-[700px] grid-cols-7 gap-px bg-border">
            {days.map((day, index) =>
              day ? (
                <article key={day.key} aria-label={`${day.key}: ${day.bookings.length} matching booking${day.bookings.length === 1 ? "" : "s"}, ${day.availableRooms} room types available`} className="min-h-28 bg-card p-1.5 sm:p-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-foreground">{day.day}</span>
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" title={`${day.availableRooms} room types available`}>
                      {day.availableRooms} free
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {day.bookings.slice(0, 3).map((booking) => (
                      <li
                        key={`${day.key}-${booking.id}`}
                        title={`${booking.name} · ${booking.roomType} · ${booking.status}`}
                        className={`truncate rounded-md border-l-2 px-1.5 py-1 text-[10px] leading-3 ${
                          booking.status === "Approved"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-200"
                            : "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950/50 dark:text-amber-200"
                        }`}
                      >
                        {booking.roomType} · {booking.name}
                      </li>
                    ))}
                    {day.bookings.length > 3 ? (
                      <li className="px-1 text-[10px] font-medium text-muted-foreground">+{day.bookings.length - 3} more</li>
                    ) : null}
                    {day.bookings.length === 0 ? (
                      <li className={`px-1 py-1 text-[10px] ${search ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-300"}`}>
                        {search ? "No matches" : "No bookings"}
                      </li>
                    ) : null}
                  </ul>
                </article>
              ) : (
                <div key={`empty-${index}`} aria-hidden="true" className="min-h-28 bg-muted/20" />
              ),
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" /> Approved</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> Pending</span>
            </div>
            <p>Checkout day is not counted as occupied · {rooms.length} room type{rooms.length === 1 ? "" : "s"}</p>
          </div>
        </div>
      )}
    </section>
  )
}
