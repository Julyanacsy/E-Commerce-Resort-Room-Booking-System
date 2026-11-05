import {
  findRoomForTenant,
  getManilaDate,
  getBookedDates,
  getBookingDb,
  datesBetween,
  normalizeDate,
} from "@/lib/booking-api-server"
import { normalizeOwnerUid } from "@/lib/booking-tenant"

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 })
  }

  const roomType = String(body?.roomType || "").trim()
  const checkIn = normalizeDate(body?.checkIn)
  const checkOut = normalizeDate(body?.checkOut)
  if (!roomType || !checkIn || !checkOut || checkIn >= checkOut) {
    return Response.json({ error: "Room and valid check-in/check-out dates are required." }, { status: 400 })
  }
  if (!datesBetween(checkIn, checkOut)) {
    return Response.json({ error: "Stay must be between 1 and 60 nights." }, { status: 400 })
  }
  if (checkIn < getManilaDate()) {
    return Response.json({ error: "Check-in date cannot be in the past." }, { status: 400 })
  }

  const db = getBookingDb()
  if (!db) {
    return Response.json({ error: "Firebase Admin credentials are not configured." }, { status: 503 })
  }

  try {
    const ownerUid = normalizeOwnerUid(body?.ownerUid)
    const room = await findRoomForTenant(db, roomType, ownerUid)
    if (!room) return Response.json({ error: "Room not found." }, { status: 404 })
    if (room.availability && room.availability !== "Available") {
      return Response.json({ available: false, error: "Room is not currently available." })
    }

    const bookedDates = await getBookedDates(db, roomType, ownerUid)
    const available = !bookedDates.some((date) => date >= checkIn && date < checkOut)
    return Response.json({ available, bookedDates })
  } catch (error) {
    console.error("Failed to check booking availability:", error)
    return Response.json({ error: "Failed to check booking availability." }, { status: 500 })
  }
}