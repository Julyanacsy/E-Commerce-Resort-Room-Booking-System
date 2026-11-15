import {
  getResortAdminMailDisplayName,
  resolveAdminInboxEmail,
  resolveCentralEnvMail,
} from "@/lib/central-env-mail"
import {
  datesBetween,
  findRoomForTenant,
  getBookingDateLockId,
  getBookedDates,
  getBookingDb,
  getLegacyRoomOwnerUid,
  getManilaDate,
  getRoomKey,
  hasActiveBookingConflict,
  normalizeDate,
  overlaps,
} from "@/lib/booking-api-server"
import { normalizeOwnerUid } from "@/lib/booking-tenant"
import { calculateReservationDeposit, DEFAULT_RESERVATION_DEPOSIT_PERCENT } from "@/lib/payment-domain.mjs"
import { verifyOtpInTransaction } from "@/lib/otp-store"
import { writeResortAdminEvent } from "@/lib/resort-admin-events.mjs"

const MAX_UPLOAD_CHARS = 350_000

function validUpload(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_UPLOAD_CHARS &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
  )
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 })
  }

  const name = String(body?.name || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const phone = String(body?.phone || "").trim()
  const roomType = String(body?.roomType || "").trim()
  const checkIn = normalizeDate(body?.checkIn)
  const checkOut = normalizeDate(body?.checkOut)
  const guests = Number(body?.guests)
  const otp = String(body?.otp || "").trim()
  const ownerUid = normalizeOwnerUid(body?.ownerUid)
  const specialRequests = String(body?.specialRequests || "").trim().slice(0, 2000)
  const cancellationTermsAcknowledged = body?.cancellationTermsAcknowledged === true

  if (
    !name ||
    name.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !phone ||
    phone.length > 40 ||
    !roomType ||
    roomType.length > 120 ||
    !checkIn ||
    !checkOut ||
    checkIn >= checkOut ||
    !cancellationTermsAcknowledged ||
    !Number.isInteger(guests) ||
    guests < 1 ||
    guests > 20 ||
    !/^\d{6}$/.test(otp)
  ) {
    return Response.json({ error: "Booking details or verification code are invalid." }, { status: 400 })
  }

  const stayDates = datesBetween(checkIn, checkOut)
  if (!stayDates) {
    return Response.json({ error: "Stay must be between 1 and 60 nights." }, { status: 400 })
  }
  if (checkIn < getManilaDate()) {
    return Response.json({ error: "Check-in date cannot be in the past." }, { status: 400 })
  }
  if (ownerUid && (!validUpload(body?.proofOfPaymentImage) || !validUpload(body?.validIdImage))) {
    return Response.json({ error: "Upload valid proof of payment and one valid ID." }, { status: 400 })
  }

  const db = getBookingDb()
  if (!db) {
    return Response.json({ error: "Firebase Admin credentials are not configured." }, { status: 503 })
  }

  try {
    const room = await findRoomForTenant(db, roomType, ownerUid)
    if (!room || (room.availability && room.availability !== "Available")) {
      return Response.json({ error: "The selected room is no longer available." }, { status: 409 })
    }
    if (guests > Math.max(1, Number(room.maxGuests) || 1)) {
      return Response.json({ error: "Guest count exceeds this room's capacity." }, { status: 400 })
    }
    const rawPrice = Number(room.price)
    if (!Number.isFinite(rawPrice) || rawPrice < 0) {
      return Response.json({ error: "The selected room does not have a valid price." }, { status: 409 })
    }

    const bookedDates = await getBookedDates(db, roomType, ownerUid)
    if (bookedDates.some((date) => date >= checkIn && date < checkOut)) {
      return Response.json({ error: "Those dates are no longer available. Please choose different dates." }, { status: 409 })
    }

    const nights = stayDates.length
    const price = rawPrice
    const rawDiscount = Number(room.discount)
    const discount = Number.isFinite(rawDiscount) ? Math.max(0, Math.min(100, rawDiscount)) : 0
    const pricePerNight = price * (1 - discount / 100)
    const totalPrice = Math.round(pricePerNight * nights * 100) / 100
    if (!Number.isFinite(totalPrice)) {
      return Response.json({ error: "The selected room price is too large to process." }, { status: 409 })
    }
    let reservationDepositPercent = DEFAULT_RESERVATION_DEPOSIT_PERCENT
    if (ownerUid) {
      const ownerSnapshot = await db.collection("resortOwners").doc(ownerUid).get()
      if (ownerSnapshot.exists) {
        const configuredPercent = Number(ownerSnapshot.get("reservationDepositPercent"))
        if (Number.isInteger(configuredPercent) && configuredPercent >= 1 && configuredPercent <= 100) {
          reservationDepositPercent = configuredPercent
        }
      }
    }
    const reservationDepositAmount = calculateReservationDeposit(totalPrice, reservationDepositPercent)
    const bookingRef = db.collection("guestbooking").doc()
    const paymentHistoryRef = ownerUid ? db.collection("paymentHistory").doc() : null
    const roomKey = getRoomKey(ownerUid, roomType)
    const legacyUid = await getLegacyRoomOwnerUid(db)
    const lockRefs = stayDates.map((date) =>
      db.collection("bookingDateLocks").doc(
        getBookingDateLockId(roomKey, date),
      ),
    )
    const bookingData = {
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
      reservationDepositPercent,
      reservationDepositAmount,
      paymentAmount: 0,
      cancellationTermsAcknowledgedAt: new Date(),
      status: "Pending",
      paymentStatus: ownerUid ? "proof_submitted" : "unpaid",
      ...(ownerUid
        ? {
            ownerUid,
            proofOfPaymentImage: body.proofOfPaymentImage,
            validIdImage: body.validIdImage,
          }
        : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await db.runTransaction(async (transaction) => {
      const otpResult = await verifyOtpInTransaction(transaction, db, { email, ownerUid, otp })
      if (!otpResult.ok) return { otpResult }

      const lockSnapshots = await Promise.all(lockRefs.map((ref) => transaction.get(ref)))
      if (lockSnapshots.some((snapshot) => snapshot.exists)) {
        throw new Error("DATES_UNAVAILABLE")
      }

      const existing = await transaction.get(
        db.collection("guestbooking").where("roomType", "==", roomType),
      )
      if (
        hasActiveBookingConflict(
          existing.docs.map((snapshot) => snapshot.data()),
          { checkIn, checkOut, ownerUid, legacyUid },
        )
      ) {
        throw new Error("DATES_UNAVAILABLE")
      }

      transaction.delete(otpResult.ref)
      transaction.create(bookingRef, bookingData)
      if (paymentHistoryRef) {
        transaction.create(paymentHistoryRef, {
          ownerUid,
          bookingId: bookingRef.id,
          guestName: name,
          roomType,
          checkIn,
          checkOut,
          action: "proof-submitted",
          paymentStatus: "proof_submitted",
          paymentMethod: "gcash",
          amount: reservationDepositAmount,
          recordedBy: "guest",
          createdAt: new Date(),
        })
      }
      if (ownerUid) {
        writeResortAdminEvent(transaction, db, {
          ownerUid,
          actorUid: "guest",
          actorEmail: "",
          actorRole: "guest",
          action: "booking.created",
          entityType: "booking",
          entityId: bookingRef.id,
          summary: "A new guest booking was submitted.",
          after: { bookingStatus: "Pending", paymentStatus: bookingData.paymentStatus },
          emailRecipients: [email],
          notification: {
            type: "booking.new",
            title: "New booking",
            message: `A booking request for ${roomType} (${bookingRef.id}) is waiting for review. Reservation deposit: PHP ${reservationDepositAmount.toLocaleString("en-PH")} (${reservationDepositPercent}%).`,
          },
        })
      }
      lockRefs.forEach((ref, index) => {
        transaction.create(ref, {
          roomKey,
          ownerUid: ownerUid || null,
          roomType,
          date: stayDates[index],
          bookingId: bookingRef.id,
          createdAt: new Date(),
        })
      })
      return { success: true }
    })
    if (result.otpResult && !result.otpResult.ok) {
      const error =
        result.otpResult.reason === "expired"
          ? "Your verification code expired. Request a new one."
          : result.otpResult.reason === "locked"
            ? "Too many incorrect codes. Request a new one."
            : "Verification code is invalid or expired."
      return Response.json({ error }, { status: 400 })
    }

    try {
      const mail = await resolveCentralEnvMail()
      if (mail.ok) {
        const reservationPaymentNote = ownerUid
          ? `\nReservation deposit due now: PHP ${reservationDepositAmount.toLocaleString("en-PH")} (${reservationDepositPercent}%). Remaining balance due at check-in: PHP ${Math.max(0, totalPrice - reservationDepositAmount).toLocaleString("en-PH")}.`
          : ""
        await mail.transporter.sendMail({
          from: `"${mail.brandName}" <${mail.user}>`,
          to: email,
          replyTo: mail.replyTo,
          subject: `Booking request received — ${mail.brandName}`,
          text: `Hello ${name}, your booking request for ${roomType} from ${checkIn} to ${checkOut} has been received and is pending resort approval. Booking reference: ${bookingRef.id}.${reservationPaymentNote}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937"><h2>Booking request received</h2><p>Hello ${name.replace(/[<>&"]/g, "")},</p><p>Your request for <strong>${roomType.replace(/[<>&"]/g, "")}</strong> from ${checkIn} to ${checkOut} has been received and is pending resort approval.</p><p>Booking reference: <strong>${bookingRef.id}</strong></p>${ownerUid ? `<p>Reservation deposit due now: <strong>PHP ${reservationDepositAmount.toLocaleString("en-PH")}</strong> (${reservationDepositPercent}%). Remaining balance due at check-in: <strong>PHP ${Math.max(0, totalPrice - reservationDepositAmount).toLocaleString("en-PH")}</strong>.</p>` : ""}</div>`,
        })
        const adminEmail = resolveAdminInboxEmail({
          brandingEmail: mail.brandingEmail,
          replyTo: mail.replyTo,
          smtpUser: mail.user,
        })
        if (adminEmail && !ownerUid) {
          await mail.transporter.sendMail({
            from: `"${getResortAdminMailDisplayName()}" <${mail.user}>`,
            to: adminEmail,
            replyTo: mail.replyTo,
            subject: `New booking request — ${roomType}`,
            text: `New booking request from ${name} (${email}) for ${roomType}, ${checkIn} to ${checkOut}. Booking reference: ${bookingRef.id}.`,
            html: `<p>New booking request from ${name.replace(/[<>&"]/g, "")} (${email.replace(/[<>&"]/g, "")}) for ${roomType.replace(/[<>&"]/g, "")}, ${checkIn} to ${checkOut}.</p><p>Booking reference: ${bookingRef.id}</p>`,
          })
        }
      } else {
        console.warn("Booking confirmation email skipped:", mail.code, mail.message)
      }
    } catch (mailError) {
      console.error("Failed to send booking confirmation email:", mailError)
    }

    return Response.json({ success: true, bookingId: bookingRef.id })
  } catch (error) {
    if (error.message === "DATES_UNAVAILABLE") {
      return Response.json({ error: "Those dates are no longer available. Please choose different dates." }, { status: 409 })
    }
    console.error("Failed to verify OTP and create booking:", error)
    return Response.json({ error: "Failed to save booking. Please try again." }, { status: 500 })
  }
}