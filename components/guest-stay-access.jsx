"use client"

import { useState } from "react"
import { KeyRound, Loader2, Wifi } from "lucide-react"

export default function GuestStayAccess({ ownerUid, theme = "light" }) {
  const [bookingId, setBookingId] = useState("")
  const [email, setEmail] = useState("")
  const [wifi, setWifi] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const dark = theme === "dark"

  const verifyStay = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError("")
    setWifi(null)
    try {
      const response = await fetch("/api/guest/stay-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUid, bookingId, email }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Guest access could not be verified.")
      setWifi(result.wifi)
    } catch (requestError) {
      setError(requestError.message || "Guest access could not be verified.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      id="guest-wifi"
      className={`px-4 py-14 sm:px-6 lg:px-8 ${dark ? "bg-slate-950 text-white" : "bg-white text-emerald-950"}`}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-xl bg-emerald-100 p-3 text-emerald-800"><Wifi aria-hidden="true" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">For in-house guests</p>
            <h2 className="text-2xl font-bold">Guest Wi-Fi</h2>
          </div>
        </div>
        <p className={`mb-5 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>
          Verify your booking to view the resort&apos;s Wi-Fi network and voucher details. Access is available only while you are checked in.
        </p>
        <form onSubmit={verifyStay} className={`grid gap-3 rounded-2xl border p-5 sm:grid-cols-[1fr_1fr_auto] ${dark ? "border-slate-700 bg-slate-900" : "border-emerald-100 bg-emerald-50/60"}`}>
          <label className="text-sm font-medium">
            Booking reference
            <input
              value={bookingId}
              onChange={(event) => setBookingId(event.target.value)}
              required
              autoComplete="off"
              maxLength={128}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              placeholder="Your booking ID"
            />
          </label>
          <label className="text-sm font-medium">
            Booking email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            Verify
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
        {wifi ? (
          <div className="mt-5 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 sm:grid-cols-2" role="status">
            <p><span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Network</span><strong>{wifi.networkName || "Ask the front desk"}</strong></p>
            <p><span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Password</span><strong>{wifi.password || "Ask the front desk"}</strong></p>
            {wifi.voucherCode ? <p><span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Wi-Fi voucher</span><strong>{wifi.voucherCode}</strong></p> : null}
            {wifi.instructions ? <p className="whitespace-pre-wrap sm:col-span-2"><span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Instructions</span>{wifi.instructions}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
