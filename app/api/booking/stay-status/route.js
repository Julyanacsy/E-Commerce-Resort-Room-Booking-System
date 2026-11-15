import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import {
  authenticateBookingAdmin,
  canManageBooking,
  getBookingDb,
  hasBookingPermission,
  jsonFailure,
} from "@/lib/booking-api-server"
import { renderBookingEmailLayout } from "@/lib/booking-email-layout"
import { getPublicAppUrl } from "@/lib/booking-feedback-server"
import { getOutstandingPaymentBalance, getRecordedPaymentAmount } from "@/lib/payment-domain.mjs"
import { writeResortAdminAudit } from "@/lib/resort-admin-events.mjs"

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!hasBookingPermission(authResult.user, "stay")) {
    return jsonFailure("Your staff role cannot update check-in or check-out.", 403)
  }

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)
  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }
  const bookingId = String(body?.bookingId || "").trim()
  const action = String(body?.action || "").trim()
  const paymentMethod = String(body?.paymentMethod || "").trim().toLowerCase()
  if (!bookingId || !["check-in", "check-out"].includes(action)) {
    return jsonFailure("Booking and stay action are required.", 400)
  }
  if (action === "check-in" && paymentMethod && !["cash", "gcash"].includes(paymentMethod)) {
    return jsonFailure("Choose cash or GCash for the check-in balance.", 400)
  }

  try {
    const bookingRef = db.collection("guestbooking").doc(bookingId)
    const snapshot = await bookingRef.get()
    if (!snapshot.exists) return jsonFailure("Booking not found.", 404)
    if (!canManageBooking(authResult.user, snapshot.data())) {
      return jsonFailure("You cannot update this booking's stay status.", 403)
    }

    const now = new Date()
    const paymentHistoryRef = db.collection("paymentHistory").doc()
    const result = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(bookingRef)
      const stayStatus = String(current.get("stayStatus") || "not_checked_in")
      if (!current.exists || current.get("status") !== "Approved") throw new Error("STAY_NOT_ACTIVE")
      if (
        (action === "check-in" && stayStatus !== "not_checked_in") ||
        (action === "check-out" && stayStatus !== "checked_in")
      ) {
        throw new Error("STAY_STATUS_CHANGED")
      }
      let paymentUpdate = null
      if (action === "check-in") {
        const booking = current.data()
        const paidAmount = getRecordedPaymentAmount(booking)
        const depositAmount = Number.isFinite(Number(booking.reservationDepositAmount))
          ? Number(booking.reservationDepositAmount)
          : Number(booking.totalPrice || 0)
        if (paidAmount + 0.009 < depositAmount) throw new Error("RESERVATION_DEPOSIT_REQUIRED")
        const balance = getOutstandingPaymentBalance(booking)
        if (balance > 0) {
          if (!["cash", "gcash"].includes(paymentMethod)) throw new Error("PAYMENT_METHOD_REQUIRED")
          paymentUpdate = {
            amount: balance,
            total: Number(booking.totalPrice || 0),
            paidAmount: Number(booking.totalPrice || 0),
            paymentMethod: String(booking.paymentMethod || "") && booking.paymentMethod !== paymentMethod
              ? "mixed"
              : paymentMethod,
          }
          transaction.create(paymentHistoryRef, {
            ownerUid: String(current.get("ownerUid") || authResult.user.ownerUid),
            bookingId,
            guestName: String(current.get("name") || ""),
            roomType: String(current.get("roomType") || ""),
            checkIn: String(current.get("checkIn") || ""),
            checkOut: String(current.get("checkOut") || ""),
            action: "balance-paid-at-check-in",
            paymentStatus: "paid",
            paymentMethod,
            amount: balance,
            recordedBy: authResult.user.uid,
            recordedByEmail: authResult.user.email,
            createdAt: now,
          })
        }
      }
      transaction.update(bookingRef, {
        stayStatus: action === "check-in" ? "checked_in" : "checked_out",
        ...(action === "check-in"
          ? { checkedInAt: now, checkedInBy: authResult.user.uid }
          : { checkedOutAt: now, checkedOutBy: authResult.user.uid }),
        ...(paymentUpdate ? {
          paymentStatus: "paid",
          paymentMethod: paymentUpdate.paymentMethod,
          paymentAmount: paymentUpdate.paidAmount,
          paidAt: now,
          paymentReviewedAt: now,
          paymentReviewedBy: authResult.user.uid,
          paymentReviewedByEmail: authResult.user.email,
        } : {}),
        updatedAt: now,
      })
      writeResortAdminAudit(transaction, db, {
        ownerUid: String(current.get("ownerUid") || authResult.user.ownerUid || authResult.user.uid),
        actorUid: authResult.user.uid,
        actorEmail: authResult.user.email,
        actorRole: authResult.user.staffRole,
        action: `booking.${action}`,
        entityType: "booking",
        entityId: bookingId,
        summary: `Booking ${bookingId} was marked ${action === "check-in" ? "checked in" : "checked out"}.`,
        before: { stayStatus },
        after: { stayStatus: action === "check-in" ? "checked_in" : "checked_out" },
        emailRecipients: current.get("email") ? [String(current.get("email"))] : [],
      })
      if (paymentUpdate) {
        writeResortAdminAudit(transaction, db, {
          ownerUid: String(current.get("ownerUid") || authResult.user.ownerUid || authResult.user.uid),
          actorUid: authResult.user.uid,
          actorEmail: authResult.user.email,
          actorRole: authResult.user.staffRole,
          action: "payment.received",
          entityType: "booking",
          entityId: bookingId,
          summary: `Remaining balance of PHP ${paymentUpdate.amount.toLocaleString("en-PH")} was collected at check-in for booking ${bookingId}.`,
          before: { paymentStatus: String(current.get("paymentStatus") || "unpaid") },
          after: {
            paymentStatus: "paid",
            paymentAmount: paymentUpdate.paidAmount,
            paymentMethod: paymentUpdate.paymentMethod,
          },
          emailRecipients: current.get("email") ? [String(current.get("email"))] : [],
        })
      }
      return {
        paymentStatus: paymentUpdate ? "paid" : String(current.get("paymentStatus") || "unpaid"),
        paymentAmount: paymentUpdate?.paidAmount ?? getRecordedPaymentAmount(current.data()),
        paymentMethod: paymentUpdate?.paymentMethod || String(current.get("paymentMethod") || ""),
        balancePaid: paymentUpdate?.amount || 0,
      }
    })
    let wifiAccessEmailSent = false
    let wifiAccessEmailWarning = ""
    if (action === "check-in") {
      const guestEmail = String(snapshot.get("email") || "").trim()
      const ownerUid = String(snapshot.get("ownerUid") || authResult.user.ownerUid || "").trim()
      if (!guestEmail || !ownerUid) {
        wifiAccessEmailWarning = "Guest checked in, but the Wi-Fi access email could not be sent because booking contact details are missing."
      } else {
        try {
          const mail = await resolveCentralEnvMail()
          if (!mail.ok) {
            console.error("Guest Wi-Fi access email unavailable:", mail.code, mail.message)
            wifiAccessEmailWarning = "Guest checked in, but the Wi-Fi access email could not be sent. Check the email configuration."
          } else {
            const accessUrl = new URL("/", getPublicAppUrl(request))
            accessUrl.searchParams.set("o", ownerUid)
            accessUrl.searchParams.set("guestWifi", "1")
            const resortName = String(snapshot.get("resortName") || snapshot.get("hotelName") || mail.brandName || "the resort")
            const message = `You are checked in at ${resortName}. Open the resort landing page and verify your booking to view the Wi-Fi details.`
            await mail.transporter.sendMail({
              from: `"${mail.brandName}" <${mail.user}>`,
              to: guestEmail,
              replyTo: mail.replyTo,
              subject: `Guest Wi-Fi access for your stay at ${resortName}`,
              text: `${message}\nBooking reference: ${bookingId}\n\nOpen the resort landing page: ${accessUrl.toString()}`,
              html: renderBookingEmailLayout({
                title: "Guest Wi-Fi access",
                greeting: `Hello ${String(snapshot.get("name") || "Guest")},`,
                message: `${message} You will need your booking reference and booking email to verify access.`,
                brandName: resortName,
                details: [{ title: "Booking reference", body: bookingId }],
                actionLink: { href: accessUrl.toString(), label: "Open resort landing page" },
              }),
            })
            wifiAccessEmailSent = true
          }
        } catch (emailError) {
          console.error("Failed to send guest Wi-Fi access email:", emailError)
          wifiAccessEmailWarning = "Guest checked in, but the Wi-Fi access email could not be sent. Check the email configuration and arrange Wi-Fi access with the guest."
        }
      }
    }
    return Response.json({
      success: true,
      bookingId,
      stayStatus: action === "check-in" ? "checked_in" : "checked_out",
      timestamp: now.toISOString(),
      wifiAccessEmailSent,
      ...(wifiAccessEmailWarning ? { wifiAccessEmailWarning } : {}),
      ...result,
    })
  } catch (error) {
    if (error.message === "STAY_NOT_ACTIVE") {
      return jsonFailure("Only approved bookings can be checked in or out.", 409)
    }
    if (error.message === "STAY_STATUS_CHANGED") {
      return jsonFailure("Stay status changed. Refresh and try again.", 409)
    }
    if (error.message === "RESERVATION_DEPOSIT_REQUIRED") {
      return jsonFailure("Verify or record the reservation deposit before checking in.", 409)
    }
    if (error.message === "PAYMENT_METHOD_REQUIRED") {
      return jsonFailure("Choose cash or GCash to record the remaining balance at check-in.", 400)
    }
    console.error("Failed to update check-in/check-out status:", error)
    return jsonFailure("Stay status could not be updated.", 500)
  }
}
