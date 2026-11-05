"use client"

import { Check, Eye, Trash2, X } from "lucide-react"
import { getGoogleDirectionsUrl } from "@/lib/maps-preview-url"

export default function ManageRooms({
  rooms,
  paginatedRooms,
  loading,
  error,
  theme,
  onAddRoom,
  onPreviewRoom,
  pendingDeleteId,
  deletingId,
  onConfirmDelete,
  onCancelDelete,
  onRequestDelete,
  roomsPage,
  totalRoomPages,
  onPageChange,
}) {
  const isDark = theme === "dark"
  const filteredRooms = Array.isArray(rooms) ? rooms : []

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
            Manage Rooms
          </h1>
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            Add new rooms or update existing inventory.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRoom}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-700/30 transition hover:-translate-y-0.5 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <span className="text-lg leading-none">+</span>
          Add Room
        </button>
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
                    {pendingDeleteId === room.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onConfirmDelete(room.id)}
                          disabled={deletingId === room.id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:border-red-400 disabled:opacity-60"
                          title="Confirm delete"
                          aria-label={`Confirm deleting ${room.name}`}
                        >
                          {deletingId === room.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
                          ) : (
                            <Check size={16} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={onCancelDelete}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-gray-400"
                          title="Cancel"
                          aria-label={`Cancel deleting ${room.name}`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRequestDelete(room.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:border-red-400"
                        title="Delete room"
                        aria-label={`Delete ${room.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

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
          No rooms added yet. Click &quot;Add Room&quot; to create one.
        </div>
      )}
    </div>
  )
}
