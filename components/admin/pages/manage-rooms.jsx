"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Archive, ArchiveRestore, Check, Eye, Search, X } from "lucide-react"
import { getGoogleDirectionsUrl } from "@/lib/maps-preview-url"
import { isRoomArchived } from "@/lib/room-archive.mjs"

export default function ManageRooms({
  rooms,
  loading,
  error,
  theme,
  onAddRoom,
  onPreviewRoom,
  busyRoomId,
  onArchiveRoom,
  onRestoreRoom,
  roomsPage,
  onPageChange,
}) {
  const isDark = theme === "dark"
  const [roomFilter, setRoomFilter] = useState("active")
  const [availabilityFilter, setAvailabilityFilter] = useState("all")
  const [roomSearch, setRoomSearch] = useState("")
  const [pendingArchiveId, setPendingArchiveId] = useState(null)
  const allRooms = Array.isArray(rooms) ? rooms : []
  const archivedRoomCount = allRooms.filter(isRoomArchived).length
  const filteredRooms = allRooms.filter((room) => {
    const matchesArchive = roomFilter === "archived"
      ? isRoomArchived(room)
      : !isRoomArchived(room)
    const availability = room.availability || "Available"
    const matchesAvailability = availabilityFilter === "all"
      || availability === availabilityFilter
    const searchTerm = roomSearch.trim().toLowerCase()
    const matchesSearch = !searchTerm
      || [room.name, room.type, room.roomNumber]
        .some((value) => String(value || "").toLowerCase().includes(searchTerm))
    return matchesArchive && matchesAvailability && matchesSearch
  })
  const roomsPerPage = 6
  const totalRoomPages = Math.max(1, Math.ceil(filteredRooms.length / roomsPerPage))
  const paginatedRooms = filteredRooms.slice(
    (roomsPage - 1) * roomsPerPage,
    roomsPage * roomsPerPage,
  )

  useEffect(() => {
    if (roomsPage > totalRoomPages) onPageChange(totalRoomPages)
  }, [onPageChange, roomsPage, totalRoomPages])

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
            Manage Rooms
          </h1>
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {roomFilter === "archived"
              ? "Archived rooms are hidden from guests. Restore one to make it bookable again."
              : "Add new rooms or update existing inventory."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setRoomFilter(roomFilter === "archived" ? "active" : "archived")
              onPageChange(1)
              setPendingArchiveId(null)
            }}
            className={`text-sm font-medium underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isDark ? "text-gray-400 hover:text-emerald-300" : "text-gray-500 hover:text-emerald-700"
            }`}
            aria-label={
              roomFilter === "archived"
                ? "Return to active rooms"
                : `View ${archivedRoomCount} archived rooms`
            }
          >
            <span className="inline-flex items-center gap-1.5">
              <Archive size={14} aria-hidden="true" />
              {roomFilter === "archived"
                ? "Back to active rooms"
                : `Archived${archivedRoomCount ? ` (${archivedRoomCount})` : ""}`}
            </span>
          </button>
          {roomFilter === "active" && (
            <button
              type="button"
              onClick={onAddRoom}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-700/30 transition hover:-translate-y-0.5 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <span className="text-lg leading-none">+</span>
              Add Room
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="relative block w-44 max-w-full">
          <span className="sr-only">Search rooms by name, type, or room number</span>
          <Search
            size={15}
            aria-hidden="true"
            className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 ${
              isDark ? "text-gray-400" : "text-gray-500"
            }`}
          />
          <input
            type="search"
            value={roomSearch}
            onChange={(event) => {
              setRoomSearch(event.target.value)
              onPageChange(1)
            }}
            placeholder="Search rooms"
            className={`h-9 w-full rounded-lg border py-1.5 pl-8 pr-2 text-sm ${
              isDark
                ? "border-slate-600 bg-slate-800 text-white placeholder:text-gray-500"
                : "border-gray-300 bg-white text-gray-800 placeholder:text-gray-400"
            }`}
          />
        </label>
        <label>
          <span className="sr-only">Filter rooms by availability</span>
          <select
            value={availabilityFilter}
            onChange={(event) => {
              setAvailabilityFilter(event.target.value)
              onPageChange(1)
            }}
            className={`h-9 rounded-lg border px-2.5 text-sm ${
              isDark
                ? "border-slate-600 bg-slate-800 text-white"
                : "border-gray-300 bg-white text-gray-800"
            }`}
          >
            <option value="all">All availability</option>
            <option value="Available">Available</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Unavailable">Unavailable</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3" aria-label="Loading rooms">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className={`animate-pulse rounded-2xl border p-6 shadow ${
                isDark ? "border-slate-700 bg-slate-800" : "border-emerald-50 bg-white"
              }`}
            >
              <div className={`mb-4 h-4 w-1/3 rounded ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
              <div className={`mb-6 h-3 w-2/3 rounded ${isDark ? "bg-slate-700" : "bg-slate-100"}`} />
              <div className={`h-10 rounded ${isDark ? "bg-slate-700" : "bg-slate-100"}`} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className={`rounded-2xl border p-5 text-sm ${
            isDark
              ? "border-red-800 bg-red-900/30 text-red-300"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {error}
        </div>
      ) : filteredRooms.length ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {paginatedRooms.map((room) => (
              <div
                key={room.id}
                className={`group flex h-full flex-col rounded-2xl border p-6 shadow transition hover:-translate-y-1 ${
                  isDark
                    ? "border-slate-700 bg-slate-800 hover:shadow-slate-700/50"
                    : "border-emerald-50 bg-white hover:shadow-emerald-200"
                }`}
              >
                <div className="relative mb-4">
                  {room.images?.[0] ? (
                    <img
                      src={room.images[0]}
                      alt={`${room.name} preview`}
                      className="h-36 w-full rounded-xl object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className={`flex h-36 w-full items-center justify-center rounded-xl border border-dashed text-sm ${
                        isDark
                          ? "border-slate-600 bg-slate-700/50 text-slate-400"
                          : "border-emerald-100 bg-emerald-50/50 text-emerald-700"
                      }`}
                    >
                      No preview
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onPreviewRoom(room)}
                    className={`absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border shadow transition ${
                      isDark
                        ? "border-slate-600/40 bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                        : "border-white/40 bg-white/80 text-emerald-800 hover:bg-white"
                    }`}
                    title={`Preview ${room.name}`}
                    aria-label={`Preview ${room.name}`}
                  >
                    <Eye size={18} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <h2
                    className={`line-clamp-1 text-lg font-bold ${
                      isDark ? "text-white" : "text-emerald-700"
                    }`}
                  >
                    {room.name}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isDark
                          ? room.availability === "Available"
                            ? "bg-emerald-900/50 text-emerald-300"
                            : room.availability === "Maintenance"
                              ? "bg-amber-900/50 text-amber-300"
                              : "bg-slate-700 text-slate-300"
                          : room.availability === "Available"
                            ? "bg-emerald-50 text-emerald-700"
                            : room.availability === "Maintenance"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {room.availability || "Unavailable"}
                    </span>
                    {isRoomArchived(room) ? (
                      <button
                        type="button"
                        onClick={() => onRestoreRoom(room.id)}
                        disabled={busyRoomId === room.id}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300"
                        aria-label={`Restore ${room.name}`}
                      >
                        {busyRoomId === room.id
                          ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
                          : <ArchiveRestore size={16} />}
                        Restore
                      </button>
                    ) : pendingArchiveId === room.id ? (
                      <div
                        role="alert"
                        className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                          isDark
                            ? "border-amber-800 bg-amber-950/50 text-amber-200"
                            : "border-amber-300 bg-amber-50 text-amber-900"
                        }`}
                      >
                        <AlertTriangle size={17} aria-hidden="true" />
                        <span className="text-xs font-medium">
                          Archive {room.name}? It will be hidden from new bookings.
                        </span>
                        <button
                          type="button"
                          onClick={() => onArchiveRoom(room.id)}
                          disabled={busyRoomId === room.id}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-full bg-amber-700 px-3 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
                        >
                          {busyRoomId === room.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
                          ) : (
                            <Check size={14} />
                          )}
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingArchiveId(null)}
                          className="inline-flex h-8 items-center justify-center rounded-full border border-current px-3 text-xs font-semibold transition hover:bg-amber-100 dark:hover:bg-amber-900"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingArchiveId(room.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 text-amber-700 transition hover:border-amber-400"
                        title="Archive room"
                        aria-label={`Archive ${room.name}`}
                      >
                        <Archive size={16} />
                      </button>
                    )}
                  </div>
                </div>
                {isRoomArchived(room) && (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Archived
                  </p>
                )}

                <p className={`mt-2 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  ₱{(room.price ?? 0).toLocaleString()} / night • {room.maxGuests ?? 1} guests
                </p>
                {room.mapsUrl && (
                  <a
                    href={getGoogleDirectionsUrl(room.mapsUrl, { destinationLabel: room.name })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex w-fit text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                  >
                    Open room map
                  </a>
                )}
                <div className={`mt-4 flex flex-wrap gap-2 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  <span className={`rounded-full px-3 py-1 ${isDark ? "bg-slate-700" : "bg-gray-100"}`}>
                    Type: {room.type}
                  </span>
                  <span className={`rounded-full px-3 py-1 ${isDark ? "bg-slate-700" : "bg-gray-100"}`}>
                    Beds: {room.beds}
                  </span>
                  {room.featured && (
                    <span
                      className={`rounded-full px-3 py-1 ${
                        isDark ? "bg-amber-900/50 text-amber-300" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      Featured
                    </span>
                  )}
                </div>
                {room.amenities?.length > 0 && (
                  <div className={`mt-4 flex flex-wrap gap-2 text-xs ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                    {room.amenities.slice(0, 4).map((amenity, index) => (
                      <span
                        key={`${room.id}-amenity-${index}`}
                        className={`rounded-full px-2 py-1 ${
                          isDark ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {amenity}
                      </span>
                    ))}
                    {room.amenities.length > 4 && (
                      <span
                        className={`rounded-full px-2 py-1 ${
                          isDark ? "bg-slate-700 text-gray-300" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        +{room.amenities.length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalRoomPages > 1 && (
            <div
              className={`mt-6 flex flex-col items-center gap-3 text-sm md:flex-row md:justify-between ${
                isDark ? "text-gray-300" : "text-gray-600"
              }`}
            >
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, roomsPage - 1))}
                disabled={roomsPage === 1}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDark
                    ? "border-emerald-700 text-emerald-300 hover:border-emerald-600"
                    : "border-emerald-200 text-emerald-800 hover:border-emerald-400"
                }`}
              >
                Previous
              </button>
              <p className="font-medium">
                Page {roomsPage} of {totalRoomPages}
              </p>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalRoomPages, roomsPage + 1))}
                disabled={roomsPage === totalRoomPages}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDark
                    ? "border-emerald-700 text-emerald-300 hover:border-emerald-600"
                    : "border-emerald-200 text-emerald-800 hover:border-emerald-400"
                }`}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div
          className={`rounded-2xl border border-dashed p-8 text-center text-sm ${
            isDark
              ? "border-emerald-800 bg-slate-800 text-gray-400"
              : "border-emerald-200 bg-white text-gray-500"
          }`}
        >
          {roomFilter === "archived"
            ? "No archived rooms."
            : "No active rooms. Archived rooms can be found using the Archived link above."}
        </div>
      )}
    </div>
  )
}
