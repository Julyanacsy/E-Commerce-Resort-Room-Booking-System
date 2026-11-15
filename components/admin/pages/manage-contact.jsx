"use client"

import { useEffect, useState } from "react"
import { collection, doc, onSnapshot, query, where } from "firebase/firestore"
import { toast } from "sonner"
import { db } from "@/lib/firebase"
import { resortAdminRequest } from "@/lib/admin-api-client"
import SearchField from "@/components/admin/search-field"

function formatCreatedAt(timestamp) {
  const date = timestamp?.toDate?.()
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : "Date unavailable"
}

export default function ManageContact({ isLegacyHelpdesk, ownerUid }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [updatingId, setUpdatingId] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!db || (!isLegacyHelpdesk && !ownerUid)) {
      setMessages([])
      setError(!db ? "Firebase is not configured." : "No resort owner is selected.")
      setLoading(false)
      return undefined
    }

    setLoading(true)
    setError("")
    const messagesRef = collection(db, "contactMessages")
    const messagesQuery =
      ownerUid && !isLegacyHelpdesk
        ? query(messagesRef, where("ownerUid", "==", ownerUid))
        : query(messagesRef)

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        const scopedMessages = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((message) =>
            isLegacyHelpdesk ? !message.ownerUid : message.ownerUid === ownerUid,
          )
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        setMessages(scopedMessages)
        setLoading(false)
      },
      (snapshotError) => {
        console.error("Failed to load contact messages:", snapshotError)
        setError("Contact messages could not be loaded.")
        setLoading(false)
      },
    )
  }, [isLegacyHelpdesk, ownerUid])

  const filteredMessages = messages.filter((message) =>
    [message.name, message.email, message.phone, message.message, message.status]
      .some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())),
  )

  const handleStatusChange = async (messageId, status) => {
    setUpdatingId(messageId)
    try {
      await resortAdminRequest("/api/resort/admin-mutations", {
        action: "contact.status",
        entityId: messageId,
        status,
      })
      toast.success(`Message marked ${status.toLowerCase()}.`)
    } catch (updateError) {
      console.error("Failed to update contact message:", updateError)
      toast.error(updateError?.message || "Failed to update message.")
    } finally {
      setUpdatingId("")
    }
  }

  return (
    <section className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Contact Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review inquiries sent from your resort site.</p>
      </div>

      <SearchField value={search} onChange={setSearch} placeholder="Search name, email, or message" />

      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">Loading messages…</p>
      ) : error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>
      ) : messages.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No contact messages yet.</p>
      ) : filteredMessages.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No messages match “{search}”.</p>
      ) : (
        <div className="space-y-4">
          {filteredMessages.map((message) => {
            const unread = String(message.status || "").toLowerCase() !== "read"
            return (
              <article key={message.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">{message.name || "Guest"}</h2>
                    <a className="text-sm text-primary underline-offset-4 hover:underline" href={`mailto:${message.email || ""}`}>
                      {message.email || "No email provided"}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">{formatCreatedAt(message.createdAt)}</p>
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${unread ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                    {unread ? "Unread" : "Read"}
                  </span>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{message.message || ""}</p>
                <button
                  type="button"
                  disabled={updatingId === message.id}
                  onClick={() => handleStatusChange(message.id, unread ? "Read" : "Unread")}
                  className="mt-4 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {updatingId === message.id ? "Saving…" : unread ? "Mark as read" : "Mark as unread"}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
