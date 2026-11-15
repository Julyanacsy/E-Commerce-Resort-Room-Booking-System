"use client"

import { useEffect, useState } from "react"
import { Loader2, Star } from "lucide-react"

export default function GuestFeedbackForm({ token }) {
  const [invitation, setInvitation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [rating, setRating] = useState(5)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    fetch(`/api/feedback/access/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "This feedback link is unavailable.")
        return result
      })
      .then((result) => {
        if (active) setInvitation(result)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "This feedback link is unavailable.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [token])

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, message }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Feedback could not be submitted.")
      window.location.replace("/feedback/submitted")
    } catch (submitError) {
      setError(submitError.message || "Feedback could not be submitted.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-4 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-emerald-100 bg-white p-6 shadow-xl sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Guest feedback</p>
        {loading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-600" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Verifying your private link…
          </p>
        ) : error && !invitation ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            {error}
          </div>
        ) : invitation ? (
          <>
            <h1 className="mt-2 text-2xl font-bold text-emerald-950">How was your stay?</h1>
            <p className="mt-2 text-sm text-slate-600">
              {invitation.guestName} · {invitation.resortName} · {invitation.checkIn} to {invitation.checkOut}
            </p>
            <p className="mt-4 text-sm text-slate-600">This private link can be used once for this booking.</p>
            <form onSubmit={submit} className="mt-6 space-y-5">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-800">Your rating</legend>
                <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      onClick={() => setRating(value)}
                      className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <Star className={`h-8 w-8 ${value <= rating ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-semibold text-slate-800">
                Tell us about your experience
                <textarea
                  required
                  minLength={1}
                  maxLength={5000}
                  rows={6}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                  placeholder="What did you enjoy? What could we improve?"
                />
              </label>
              {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
              <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {submitting ? "Submitting…" : "Submit one-time feedback"}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  )
}
