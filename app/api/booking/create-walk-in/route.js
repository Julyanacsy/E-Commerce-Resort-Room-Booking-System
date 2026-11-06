import crypto from "node:crypto"
import {
  authenticateBookingAdmin,
  datesBetween,
  findRoomForTenant,
  getBookingDb,
  getManilaDate,
  getRoomKey,
  jsonFailure,
  normalizeDate,
  overlaps,
} from "@/lib/booking-api-server"

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  const { user } = authResult
  if (user.isLegacyAdmin) return jsonFailure("Only a resort owner can add a walk-in booking.", 403)

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }

  const name = String(body?.name || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const phone = String(body?.phone || "").trim()
  const roomType = String(body?.roomType || "").trim()
  const checkIn = normalizeDate(body?.checkIn)
  const checkOut = normalizeDate(body?.checkOut)
  const guests = Number(body?.guests)
  const specialRequests = String(body?.specialRequests || "").trim().slice(0, 1000)
  if (
    !name ||
    name.length > 120 ||
    (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) ||
    phone.length > 40 ||
    !roomType ||
    roomType.length > 120 ||
    !checkIn ||
    !checkOut ||
    checkIn >= checkOut ||
    !Number.isInteger(guests) ||
    guests < 1 ||
    guests > 20
  ) {
    return jsonFailure("Enter a guest name, room, valid dates, and guest count.", 400)
  }

  const stayDates = datesBetween(checkIn, checkOut)
  if (!stayDates) return jsonFailure("Stay must be between 1 and 60 nights.", 400)
  if (checkIn < getManilaDate()) return jsonFailure("Check-in date cannot be in the past.", 400)

  try {
    const ownerSnapshot = await db.collection("resortOwners").doc(user.uid).get()
    if (!ownerSnapshot.exists || String(ownerSnapshot.get("status") || "").toLowerCase() !== "approved") {
      return jsonFailure("Only an approved resort owner can add walk-in bookings.", 403)
    }

    const room = await findRoomForTenant(db, roomType, user.uid)
    if (!room || room.ownerUid !== user.uid) return jsonFailure("Room not found for this resort.", 404)
    if (room.availability && room.availability !== "Available") {
      return jsonFailure("The selected room is not currently available.", 409)
    }
    if (guests > Math.max(1, Number(room.maxGuests) || 1)) {
      return jsonFailure("Guest count exceeds this room's capacity.", 400)
    }

    const rawPrice = Number(room.price)
    if (!Number.isFinite(rawPrice) || rawPrice < 0) {
      return jsonFailure("The selected room does not have a valid price.", 409)
    }
    const nights = stayDates.length
    const rawDiscount = Number(room.discount)
    const discount = Number.isFinite(rawDiscount) ? Math.max(0, Math.min(100, rawDiscount)) : 0
    const pricePerNight = Math.round(rawPrice * (1 - discount / 100) * 100) / 100
    const totalPrice = Math.round(pricePerNight * nights * 100) / 100
    if (!Number.isFinite(totalPrice)) return jsonFailure("The room price could not be calculated.", 409)

    const roomKey = getRoomKey(user.uid, roomType)
    const lockRefs = stayDates.map((date) =>
      db.collection("bookingDateLocks").doc(
        crypto.createHash("sha256").update(`${roomKey}\n${date}`).digest("hex"),
      ),
    )
    const bookingRef = db.collection("guestbooking").doc()
    const historyRef = db.collection("paymentHistory").doc()
    await db.runTransaction(async (transaction) => {
      const lockSnapshots = await Promise.all(lockRefs.map((ref) => transaction.get(ref)))
      if (lockSnapshots.some((snapshot) => snapshot.exists)) {
        throw new Error("DATES_UNAVAILABLE")
      }

      const existing = await transaction.get(
        db.collection("guestbooking").where("roomType", "==", roomType),
      )
      const conflictingBooking = existing.docs.some((snapshot) => {
        const booking = snapshot.data()
        return (
          booking.ownerUid === user.uid &&
          ["Pending", "Approved"].includes(booking.status || "Pending") &&
          overlaps(checkIn, checkOut, booking.checkIn, booking.checkOut)
        )
      })
      if (conflictingBooking) throw new Error("DATES_UNAVAILABLE")

      const now = new Date()
      transaction.create(bookingRef, {
        ownerUid: user.uid,
        name,
        email,
        phone,
        roomType,
        roomId: room.id,
        checkIn,
        checkOut,
        guests,
        specialRequests,
        nights,
        pricePerNight,
        totalPrice,
        status: "Approved",
        paymentStatus: "paid",
        paymentMethod: "cash",
        paymentAmount: totalPrice,
        paymentSource: "walk-in",
        paymentRecordedBy: user.uid,
        paymentReviewedAt: now,
        paymentReviewedBy: user.uid,
        createdAt: now,
        updatedAt: now,
      })
      transaction.create(historyRef, {
        ownerUid: user.uid,
        bookingId: bookingRef.id,
        guestName: name,
        roomType,
        checkIn,
        checkOut,
        action: "walk-in-cash-recorded",
        paymentStatus: "paid",
        paymentMethod: "cash",
        amount: totalPrice,
        recordedBy: user.uid,
        createdAt: now,
      })
      lockRefs.forEach((ref, index) => {
        transaction.create(ref, {
          roomKey,
          ownerUid: user.uid,
          roomType,
          date: stayDates[index],
          bookingId: bookingRef.id,
          createdAt: now,
        })
      })
    })

    return Response.json({
      success: true,
      bookingId: bookingRef.id,
      totalPrice,
      paymentStatus: "paid",
      paymentMethod: "cash",
    })
  } catch (error) {
    if (error.message === "DATES_UNAVAILABLE") {
      return jsonFailure("Those dates are no longer available. Please choose different dates.", 409)
    }
    console.error("Failed to create walk-in booking:", error)
    return jsonFailure("Walk-in booking could not be saved.", 500)
  }
}
