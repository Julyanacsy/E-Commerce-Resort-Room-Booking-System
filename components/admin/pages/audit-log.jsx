"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RotateCw } from "lucide-react"
import { resortAdminRequest } from "@/lib/admin-api-client"
import SearchField from "@/components/admin/search-field"

function formatDate(value) {
  if (!value) return "Date unavailable"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function describeChanges(value) {
  if (!value || typeof value !== "object" || Object.keys(value).length === 0) return null
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" · ")
}

export default function AuditLog() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [nextCursor, setNextCursor] = useState("")
  const [search, setSearch] = useState("")

  const filteredEntries = entries.filter((entry) =>
    [
      entry.summary,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.actorEmail,
      entry.actorUid,
      entry.actorRole,
    ].some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())),
  )

  const load = useCallback(async (cursor = "", append = false) => {
    setLoading(true)
    try {
      const path = cursor ? `/api/resort/audit-logs?cursor=${encodeURIComponent(cursor)}` : "/api/resort/audit-logs"
      const result = await resortAdminRequest(path, undefined, "GET")
      const page = Array.isArray(result.entries) ? result.entries : []
      setEntries((current) => append ? [...current, ...page] : page)
      setNextCursor(result.nextCursor || "")
      setError("")
    } catch (loadError) {
      setError(loadError.message || "Audit log could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Successful resort changes, with actor and timestamp.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
        >
          <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </header>
      <SearchField value={search} onChange={setSearch} placeholder="Search action, item, or actor" />
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {loading && entries.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading audit log…
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No successful changes have been recorded yet.</p>
      ) : filteredEntries.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No loaded audit entries match “{search}”. Load older entries to search earlier records.</p>
      ) : (
        <ol className="space-y-3">
          {filteredEntries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-foreground">{entry.summary || entry.action}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.action} · {entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}
                  </p>
                </div>
                <time className="text-xs text-muted-foreground" dateTime={entry.createdAt || undefined}>
                  {formatDate(entry.createdAt)}
                </time>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Actor: {entry.actorEmail || entry.actorUid || "System"}
                {entry.actorRole ? ` (${entry.actorRole})` : ""}
              </p>
              {describeChanges(entry.before) || describeChanges(entry.after) ? (
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  {describeChanges(entry.before) ? <p><span className="font-semibold">Before:</span> {describeChanges(entry.before)}</p> : null}
                  {describeChanges(entry.after) ? <p><span className="font-semibold">After:</span> {describeChanges(entry.after)}</p> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {!loading && nextCursor ? (
        <button
          type="button"
          onClick={() => void load(nextCursor, true)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Load older entries
        </button>
      ) : null}
    </section>
  )
}
