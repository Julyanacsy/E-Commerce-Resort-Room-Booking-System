"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { bookingAdminRequest } from "@/lib/booking-admin-client"

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
        return {
          day,
          key,
          bookings: active,
          availableRooms: Math.max(0, rooms.length - new Set(active.map((booking) => booking.roomType)).size),
        }
      }),
    ]
  }, [bookings, month, rooms.length])

  const moveMonth = (amount) => {
    const [year, monthNumber] = month.split("-").map(Number)
    const next = new Date(year, monthNumber - 1 + amount, 1)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`)
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Booking Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Occupied room types and available rooms by date.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="rounded-lg border border-border p-2 hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || localMonth())}
            aria-label="Calendar month"
            className="rounded-lg border border-border bg-background px-3 py-2"
          />
          <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="rounded-lg border border-border p-2 hover:bg-muted">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={loadCalendar} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </header>

      {loading ? (
        <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading calendar…</p>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</p>
      ) : rooms.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Add rooms to see their availability here.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <div className="grid min-w-[840px] grid-cols-7 border-b border-border bg-muted/50 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <div key={weekday} className="p-3">{weekday}</div>
            ))}
          </div>
          <div className="grid min-w-[840px] grid-cols-7">
            {days.map((day, index) =>
              day ? (
                <article key={day.key} className="min-h-36 border-b border-r border-border p-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-bold text-foreground">{day.day}</span>
                    <span className="text-[10px] text-muted-foreground">{day.availableRooms} available</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {day.bookings.slice(0, 3).map((booking) => (
                      <li
                        key={`${day.key}-${booking.id}`}
                        title={`${booking.name} · ${booking.roomType} · ${booking.status}`}
                        className={`truncate rounded px-1.5 py-1 text-[11px] ${
                          booking.status === "Approved"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {booking.roomType} · {booking.name}
                      </li>
                    ))}
                    {day.bookings.length > 3 ? (
                      <li className="text-[10px] text-muted-foreground">+{day.bookings.length - 3} more</li>
                    ) : null}
                    {day.bookings.length === 0 ? (
                      <li className="mt-2 text-[10px] text-emerald-700">All {rooms.length} room types available</li>
                    ) : null}
                  </ul>
                </article>
              ) : (
                <div key={`empty-${index}`} className="min-h-36 border-b border-r border-border bg-muted/20" />
              ),
            )}
          </div>
          <p className="p-3 text-xs text-muted-foreground">
            Availability follows active booking dates (check-out date is not occupied). {rooms.length} room type{rooms.length === 1 ? "" : "s"} configured.
          </p>
        </div>
      )}
    </section>
  )
}
