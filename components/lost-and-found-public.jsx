"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, CalendarDays, Loader2, MapPin, MessageCircle, Send } from "lucide-react"

const EMPTY_CLAIM = {
  name: "",
  email: "",
  contact: "",
  reservationId: "",
  checkIn: "",
  checkOut: "",
  message: "",
}

function threadStorageKey(ownerUid, itemId) {
  return `bayrest-lost-found:${ownerUid}:${itemId}`
}

function formatMessageDate(value) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export default function LostAndFoundPublic({
  ownerUid,
  theme = "light",
  resortName = "this resort",
  contactEmail = "",
  contactPhone = "",
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedItem, setSelectedItem] = useState("")
  const [claim, setClaim] = useState(EMPTY_CLAIM)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState("")
  const [claimSession, setClaimSession] = useState(null)
  const [thread, setThread] = useState(null)
  const [threadDraft, setThreadDraft] = useState("")
  const [sendingReply, setSendingReply] = useState(false)
  const dark = theme === "dark"

  const activeItem = useMemo(() => items[activeIndex] || null, [activeIndex, items])

  const loadItems = useCallback(async () => {
    if (!ownerUid) return
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/resort/lost-and-found/public?ownerUid=${encodeURIComponent(ownerUid)}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Lost and Found items could not be loaded.")
      if (!Array.isArray(result.items)) throw new Error("The Lost and Found service returned invalid data.")
      setItems(result.items)
      setActiveIndex((index) => Math.min(index, Math.max(0, result.items.length - 1)))
    } catch (loadError) {
      setError(loadError.message || "Lost and Found items could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [ownerUid])

  const loadThread = useCallback(async (session) => {
    if (!session) return
    try {
      const response = await fetch("/api/resort/lost-and-found/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        action: "claim.thread",
        ownerUid,
        itemId: session.itemId,
        claimId: session.claimId,
        token: session.token,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Claim messages could not be loaded.")
      setThread(result)
    } catch (threadError) {
      setError(threadError.message || "Claim messages could not be loaded.")
    }
  }, [ownerUid])

  useEffect(() => { void loadItems() }, [loadItems])

  useEffect(() => {
    if (!activeItem || selectedItem === activeItem.id) return undefined
    const stored = window.localStorage.getItem(threadStorageKey(ownerUid, activeItem.id))
    if (!stored) {
      setClaimSession(null)
      setThread(null)
      return undefined
    }
    try {
      const session = JSON.parse(stored)
      if (!session?.claimId || !session?.token) throw new Error("Invalid saved claim conversation.")
      setClaimSession({ ...session, itemId: activeItem.id })
      void loadThread({ ...session, itemId: activeItem.id })
    } catch (storageError) {
      console.error("Could not restore saved Lost and Found claim:", storageError)
      window.localStorage.removeItem(threadStorageKey(ownerUid, activeItem.id))
      setClaimSession(null)
      setThread(null)
    }
  }, [activeItem, loadThread, ownerUid, selectedItem])

  useEffect(() => {
    if (items.length < 2 || selectedItem || claimSession) return undefined
    const timer = setInterval(() => {
      setActiveIndex((index) => (index + 1) % items.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [claimSession, items.length, selectedItem])

  useEffect(() => {
    if (!claimSession) return undefined
    void loadThread(claimSession)
    const timer = setInterval(() => void loadThread(claimSession), 10_000)
    return () => clearInterval(timer)
  }, [claimSession, loadThread])

  const submitClaim = async (event) => {
    event.preventDefault()
    if (!activeItem) return
    setSubmitting(true)
    setNotice("")
    setError("")
    try {
      const response = await fetch("/api/resort/lost-and-found/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUid, itemId: activeItem.id, claim }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Your claim could not be submitted.")
      const session = { itemId: activeItem.id, claimId: result.claimId, token: result.token }
      window.localStorage.setItem(threadStorageKey(ownerUid, activeItem.id), JSON.stringify(session))
      setClaimSession(session)
      setNotice(result.message || "Your verified claim was sent to resort staff.")
      setClaim(EMPTY_CLAIM)
      setSelectedItem("")
      await loadThread(session)
    } catch (submitError) {
      setError(submitError.message || "Your claim could not be submitted.")
    } finally {
      setSubmitting(false)
    }
  }

  const sendReply = async (event) => {
    event.preventDefault()
    const message = threadDraft.trim()
    if (!claimSession || !message) return
    setSendingReply(true)
    setError("")
    try {
      const response = await fetch("/api/resort/lost-and-found/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim.reply",
          ownerUid,
          itemId: claimSession.itemId,
          claimId: claimSession.claimId,
          token: claimSession.token,
          message,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Your message could not be sent.")
      setThreadDraft("")
      await loadThread(claimSession)
    } catch (replyError) {
      setError(replyError.message || "Your message could not be sent.")
    } finally {
      setSendingReply(false)
    }
  }

  const openClaimForm = () => {
    setSelectedItem(activeItem.id)
    setClaimSession(null)
    setThread(null)
    setClaim(EMPTY_CLAIM)
    setError("")
  }

  const changeItem = (offset) => {
    setActiveIndex((index) => (index + offset + items.length) % items.length)
    setSelectedItem("")
    setClaimSession(null)
    setThread(null)
    setClaim(EMPTY_CLAIM)
    setNotice("")
    setError("")
  }

  const textClass = dark ? "text-slate-200" : "text-gray-700"
  const fieldClass = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground"

  return (
    <section id="lost-and-found" className={`px-4 py-16 sm:px-6 lg:px-8 ${dark ? "bg-slate-900" : "bg-emerald-50/60"}`}>
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 text-center">
          <h2 className={`text-3xl font-bold tracking-tight md:text-4xl ${dark ? "text-white" : "text-emerald-800"}`}>Lost and Found</h2>
          <p className={`mx-auto mt-3 max-w-2xl text-sm md:text-base ${dark ? "text-slate-300" : "text-gray-600"}`}>
            Found items stay with the resort. Claims are checked against your completed booking and recorded check-in/check-out before staff reviews them.
          </p>
        </header>
        {notice ? <p role="status" className="mx-auto mb-4 max-w-3xl rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
        {error ? <p role="alert" className="mx-auto mb-4 max-w-3xl rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {loading ? <p role="status" className={`flex items-center justify-center gap-2 py-10 text-sm ${dark ? "text-slate-300" : "text-gray-600"}`}><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading found items…</p> : null}
        {!loading && items.length === 0 ? <p className={`rounded-xl border p-6 text-center text-sm ${dark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-emerald-100 bg-white text-gray-600"}`}>There are no found items to display right now.</p> : null}

        {!loading && activeItem ? (
          <article className={`overflow-hidden rounded-2xl border shadow-lg ${dark ? "border-slate-700 bg-slate-800" : "border-emerald-100 bg-white"}`}>
            <div className="relative">
              <div className="grid md:grid-cols-[0.85fr_1.15fr]">
                <img
                  src={activeItem.photo}
                  alt={`Found item: ${activeItem.description}`}
                  className="h-60 w-full bg-muted object-cover sm:h-72 md:h-full md:min-h-80"
                />
                <div className="flex flex-col justify-center space-y-4 p-5 sm:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-900">
                      Found item
                    </span>
                    <span className={`text-xs ${dark ? "text-slate-400" : "text-gray-500"}`}>
                      {activeIndex + 1} / {items.length}
                    </span>
                  </div>
                  <h3 className={`text-xl font-bold sm:text-2xl ${dark ? "text-white" : "text-emerald-950"}`}>{activeItem.description}</h3>
                  <p className={`flex items-center gap-2 text-sm ${textClass}`}><CalendarDays size={16} aria-hidden="true" /> Found {activeItem.foundDate}</p>
                  <p className={`flex items-center gap-2 text-sm ${textClass}`}><MapPin size={16} aria-hidden="true" /> Found at {activeItem.location}</p>
                  <div className={`rounded-lg p-3 text-sm ${dark ? "bg-slate-700 text-slate-100" : "bg-emerald-50 text-emerald-950"}`}>
                    Pickup point: <strong>{activeItem.pickupLocation || "Front Desk"}</strong>. Please wait for staff confirmation before collecting.
                  </div>
                  {contactEmail || contactPhone ? (
                    <p className={`text-xs ${dark ? "text-slate-400" : "text-gray-500"}`}>
                      {resortName} contact: {contactEmail || contactPhone}
                      {contactEmail && contactPhone ? ` · ${contactPhone}` : ""}
                    </p>
                  ) : null}
                  {!claimSession && selectedItem !== activeItem.id ? (
                    <button type="button" onClick={openClaimForm} className="inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800">
                      <MessageCircle size={16} aria-hidden="true" /> This is mine — verify my stay
                    </button>
                  ) : null}
                </div>
              </div>
              {items.length > 1 ? (
                <div className="absolute right-4 top-4 flex gap-2">
                  <button type="button" onClick={() => changeItem(-1)} aria-label="Previous found item" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-slate-950/60 text-white backdrop-blur transition hover:bg-slate-950">
                    <ArrowLeft size={18} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => changeItem(1)} aria-label="Next found item" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-slate-950/60 text-white backdrop-blur transition hover:bg-slate-950">
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>

            {selectedItem === activeItem.id ? (
              <form onSubmit={(event) => void submitClaim(event)} className={`grid gap-4 border-t p-5 sm:grid-cols-2 sm:p-8 ${dark ? "border-slate-700" : "border-emerald-100"}`}>
                <div className="sm:col-span-2">
                  <h4 className={`font-semibold ${dark ? "text-white" : "text-emerald-950"}`}>Verify your completed stay</h4>
                  <p className={`mt-1 text-xs ${dark ? "text-slate-400" : "text-gray-500"}`}>
                    Your booking reference, contact details, dates, and recorded check-in/check-out must match a completed stay at this resort.
                  </p>
                </div>
                <label className={`block text-sm ${textClass}`}>Full name<input required maxLength={100} autoComplete="name" value={claim.name} onChange={(event) => setClaim({ ...claim, name: event.target.value })} className={fieldClass} /></label>
                <label className={`block text-sm ${textClass}`}>Booking reference<input required minLength={6} maxLength={128} autoComplete="off" value={claim.reservationId} onChange={(event) => setClaim({ ...claim, reservationId: event.target.value })} className={fieldClass} placeholder="Reference from your booking confirmation" /></label>
                <label className={`block text-sm ${textClass}`}>Booking email<input required type="email" maxLength={254} autoComplete="email" value={claim.email} onChange={(event) => setClaim({ ...claim, email: event.target.value })} className={fieldClass} /></label>
                <label className={`block text-sm ${textClass}`}>Booking contact number<input required maxLength={80} autoComplete="tel" value={claim.contact} onChange={(event) => setClaim({ ...claim, contact: event.target.value })} className={fieldClass} /></label>
                <label className={`block text-sm ${textClass}`}>Check-in date<input required type="date" value={claim.checkIn} onChange={(event) => setClaim({ ...claim, checkIn: event.target.value })} className={fieldClass} /></label>
                <label className={`block text-sm ${textClass}`}>Check-out date<input required type="date" value={claim.checkOut} onChange={(event) => setClaim({ ...claim, checkOut: event.target.value })} className={fieldClass} /></label>
                <label className={`block text-sm sm:col-span-2 ${textClass}`}>Message to resort staff (optional)<textarea maxLength={1000} rows={3} value={claim.message} onChange={(event) => setClaim({ ...claim, message: event.target.value })} className={fieldClass} placeholder="Add details that help identify the item." /></label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                    {submitting ? "Verifying…" : "Verify stay and send claim"}
                  </button>
                  <button type="button" onClick={() => { setSelectedItem(""); setError("") }} className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${dark ? "border-slate-600 text-slate-200" : "border-border text-foreground"}`}>Cancel</button>
                </div>
              </form>
            ) : null}

            {claimSession?.itemId === activeItem.id ? (
              <div className={`border-t p-5 sm:p-8 ${dark ? "border-slate-700" : "border-emerald-100"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className={`font-semibold ${dark ? "text-white" : "text-emerald-950"}`}>Message resort staff</h4>
                    <p className={`mt-1 text-xs ${dark ? "text-slate-400" : "text-gray-500"}`}>
                      Claim status: <strong className="capitalize">{thread?.claim?.status || "pending"}</strong>. Staff will confirm the pickup point before you visit.
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Pickup: {thread?.claim?.pickupLocation || activeItem.pickupLocation || "Front Desk"}</span>
                </div>
                <div className={`mt-4 max-h-72 space-y-3 overflow-y-auto rounded-xl p-4 ${dark ? "bg-slate-900" : "bg-slate-50"}`} aria-live="polite">
                  {!thread?.messages?.length ? <p className={`text-sm ${textClass}`}>Your verified claim is in the staff inbox. You can send a message if needed.</p> : null}
                  {thread?.messages?.map((message) => (
                    <div key={message.id} className={`max-w-[90%] rounded-lg p-3 text-sm ${message.authorRole === "guest" ? "ml-auto bg-emerald-100 text-emerald-950" : dark ? "bg-slate-700 text-slate-100" : "bg-white text-gray-800 shadow-sm"}`}>
                      <p className="mb-1 text-[11px] font-semibold opacity-70">{message.authorName || (message.authorRole === "guest" ? "You" : "Resort Staff")} · {formatMessageDate(message.createdAt)}</p>
                      <p className="whitespace-pre-wrap">{message.message}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={(event) => void sendReply(event)} className="mt-3 flex gap-2">
                  <input value={threadDraft} onChange={(event) => setThreadDraft(event.target.value)} maxLength={1000} required placeholder="Write a message to resort staff…" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                  <button type="submit" disabled={sendingReply || !threadDraft.trim()} aria-label="Send message" className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              </div>
            ) : null}

            {items.length > 1 ? (
              <div className="flex justify-center gap-1.5 border-t border-emerald-100 px-4 py-3" aria-label={`Found item ${activeIndex + 1} of ${items.length}`}>
                {items.map((item, index) => (
                  <button key={item.id} type="button" onClick={() => { setActiveIndex(index); setSelectedItem(""); setClaimSession(null); setThread(null); setError("") }} className={`h-2 rounded-full transition-all ${index === activeIndex ? "w-6 bg-emerald-700" : "w-2 bg-emerald-200 hover:bg-emerald-400"}`} aria-label={`Show found item ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined} />
                ))}
              </div>
            ) : null}
          </article>
        ) : null}
      </div>
    </section>
  )
}
