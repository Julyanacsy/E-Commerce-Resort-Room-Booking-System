"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell, Check, ClipboardList, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { resortAdminRequest } from "@/lib/admin-api-client"

function formatCreatedAt(value) {
  if (!value) return "Just now"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export default function AdminNotificationBell({ onOpenAuditLog, onOpenLostAndFound }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState("")
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")

  const loadNotifications = useCallback(async () => {
    try {
      const result = await resortAdminRequest("/api/resort/admin-notifications", undefined, "GET")
      setNotifications(Array.isArray(result.notifications) ? result.notifications : [])
      setUnreadCount(Number(result.unreadCount) || 0)
      setError("")
    } catch (loadError) {
      setError(loadError.message || "Notifications could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNotifications()
    const timer = window.setInterval(() => void loadNotifications(), 30_000)
    return () => window.clearInterval(timer)
  }, [loadNotifications])

  const markRead = async (notificationId) => {
    setBusyId(notificationId)
    try {
      await resortAdminRequest("/api/resort/admin-notifications", {
        action: "mark-read",
        notificationId,
      }, "PATCH")
      await loadNotifications()
    } catch (markError) {
      toast.error(markError.message || "Notification could not be marked as read.")
    } finally {
      setBusyId("")
    }
  }

  const markAllRead = async () => {
    setBusyId("all")
    try {
      await resortAdminRequest("/api/resort/admin-notifications", { action: "mark-all-read" }, "PATCH")
      await loadNotifications()
    } catch (markError) {
      toast.error(markError.message || "Notifications could not be marked as read.")
    } finally {
      setBusyId("")
    }
  }

  return (
    <div className="relative mb-5 flex justify-end">
      <button
        type="button"
        aria-label={`Admin notifications, ${unreadCount} unread`}
        aria-expanded={open}
        aria-controls="admin-notification-panel"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold leading-5 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          id="admin-notification-panel"
          aria-label="Admin notifications"
          className="absolute right-0 top-14 z-40 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="font-semibold text-foreground">Notifications</h2>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {unreadCount} unread
              </p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!unreadCount || Boolean(busyId)}
              className="text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {busyId === "all" ? "Saving…" : "Mark all read"}
            </button>
          </header>
          {error ? (
            <p className="p-4 text-sm text-red-700" role="alert">{error}</p>
          ) : loading ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading notifications…
            </p>
          ) : notifications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-[min(65vh,30rem)] divide-y divide-border overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id} className={`p-4 ${notification.read ? "" : "bg-emerald-50/70 dark:bg-emerald-950/20"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{notification.title || "Notification"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{notification.message || ""}</p>
                      <time className="mt-2 block text-xs text-muted-foreground" dateTime={notification.createdAt || undefined}>
                        {formatCreatedAt(notification.createdAt)}
                      </time>
                      {onOpenLostAndFound && String(notification.type || "").startsWith("lost-found-") ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onOpenLostAndFound?.()
                          }}
                          className="mt-2 text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline"
                        >
                          Open Lost and Found inbox
                        </button>
                      ) : null}
                    </div>
                    {!notification.read ? (
                      <button
                        type="button"
                        aria-label={`Mark ${notification.title || "notification"} as read`}
                        disabled={Boolean(busyId)}
                        onClick={() => markRead(notification.id)}
                        className="shrink-0 rounded-md p-2 text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
                      >
                        {busyId === notification.id
                          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          : <Check className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {onOpenAuditLog ? (
            <footer className="border-t border-border p-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenAuditLog()
                }}
                className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                View audit log
              </button>
            </footer>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
