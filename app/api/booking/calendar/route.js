import {
  authenticateBookingAdmin,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
  normalizeDate,
} from "@/lib/booking-api-server"
import { isRoomArchived } from "@/lib/room-archive.mjs"

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!hasBookingPermission(authResult.user, "calendar")) {
    return jsonFailure("Your staff role cannot view the booking calendar.", 403)
  }

  const month = new URL(request.url).searchParams.get("month") || ""
  if (!/^\d{4}-\d{2}$/.test(month)) return jsonFailure("A valid calendar month is required.", 400)
  const monthStart = `${month}-01`
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1))
    .toISOString()
    .slice(0, 10)
  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const ownerUid = authResult.user.ownerUid
    const [bookingsSnapshot, roomsSnapshot] = await Promise.all([
      db.collection("guestbooking").where("ownerUid", "==", ownerUid).limit(1000).get(),
      db.collection("rooms").where("ownerUid", "==", ownerUid).limit(500).get(),
    ])
    const bookings = bookingsSnapshot.docs
      .map((item) => {
        const booking = item.data()
        return {
          id: item.id,
          name: String(booking.name || "Guest"),
          roomType: String(booking.roomType || "Room"),
          checkIn: String(booking.checkIn || ""),
          checkOut: String(booking.checkOut || ""),
          status: String(booking.status || "Pending"),
          stayStatus: String(booking.stayStatus || "not_checked_in"),
        }
      })
      .filter(
        (booking) =>
          normalizeDate(booking.checkIn) &&
          normalizeDate(booking.checkOut) &&
          booking.checkIn < monthEnd &&
          booking.checkOut > monthStart &&
          ["Pending", "Approved"].includes(booking.status),
      )
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    const rooms = roomsSnapshot.docs
      .filter((item) => !isRoomArchived(item.data()))
      .map((item) => String(item.get("name") || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))

    return Response.json({ month, rooms, bookings })
  } catch (error) {
    console.error("Failed to load booking calendar:", error)
    return jsonFailure("Booking calendar could not be loaded.", 500)
  }
}
