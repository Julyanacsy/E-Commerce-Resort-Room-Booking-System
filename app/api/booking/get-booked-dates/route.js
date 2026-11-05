import {
  bookingBelongsToTenant,
  getBookedDates,
  getBookingDb,
  getLegacyRoomOwnerUid,
  isActiveBooking,
  normalizeOwnerUid,
} from "@/lib/booking-api-server"

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 })
  }

  const roomType = String(body?.roomType || "").trim()
  if (!roomType || roomType.length > 120) {
    return Response.json({ error: "A valid room type is required." }, { status: 400 })
  }

  const db = getBookingDb()
  if (!db) {
    return Response.json({ error: "Firebase Admin credentials are not configured." }, { status: 503 })
  }

  try {
    const ownerUid = normalizeOwnerUid(body?.ownerUid)
    const bookedDates = await getBookedDates(db, roomType, ownerUid)
    const bookingSnapshot = await db
      .collection("guestbooking")
      .where("roomType", "==", roomType)
      .get()
    const legacyUid = await getLegacyRoomOwnerUid(db)
    const bookedRanges = bookingSnapshot.docs
      .map((item) => item.data())
      .filter(
        (booking) =>
          isActiveBooking(booking) &&
          bookingBelongsToTenant(booking, ownerUid, legacyUid) &&
          booking.checkIn &&
          booking.checkOut,
      )
      .map((booking) => ({ checkIn: booking.checkIn, checkOut: booking.checkOut }))
    return Response.json({ bookedDates, bookedRanges })
  } catch (error) {
    console.error("Failed to load booked dates:", error)
    return Response.json({ error: "Failed to load booked dates." }, { status: 500 })
  }
}