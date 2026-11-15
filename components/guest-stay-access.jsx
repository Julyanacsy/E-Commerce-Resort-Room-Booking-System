"use client"

import { useEffect, useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function GuestStayAccess({ ownerUid }) {
  const [open, setOpen] = useState(false)
  const [bookingId, setBookingId] = useState("")
  const [email, setEmail] = useState("")
  const [wifi, setWifi] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!ownerUid || typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (url.searchParams.get("guestWifi") !== "1") return

    setOpen(true)
    url.searchParams.delete("guestWifi")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  }, [ownerUid])

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setBookingId("")
      setEmail("")
      setWifi(null)
      setError("")
    }
  }

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Guest Wi-Fi access</DialogTitle>
          <DialogDescription>
            Enter the booking reference and email address from your reservation. Wi-Fi details are available only while your approved booking is checked in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={verifyStay} className="grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-medium text-emerald-950">
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
          <label className="text-sm font-medium text-emerald-950">
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
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            Verify
          </button>
        </form>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        {wifi ? (
          <div className="grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 sm:grid-cols-2" role="status">
            <p><span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Network</span><strong>{wifi.networkName || "Ask the front desk"}</strong></p>
            <p><span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Password</span><strong>{wifi.password || "Ask the front desk"}</strong></p>
            {wifi.voucherCode ? <p><span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Wi-Fi voucher</span><strong>{wifi.voucherCode}</strong></p> : null}
            {wifi.instructions ? <p className="whitespace-pre-wrap sm:col-span-2"><span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Instructions</span>{wifi.instructions}</p> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
