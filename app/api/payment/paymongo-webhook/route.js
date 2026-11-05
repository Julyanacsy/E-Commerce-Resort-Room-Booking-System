import { NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, getDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore"
import { normalizeOwnerUid } from "@/lib/booking-tenant"
import { resolvePaymentForBooking } from "@/lib/resort-payment-server"

function extractPaymentLinkIdFromEvent(event) {
  const paymentData = event?.data
  if (!paymentData) return null
  const paymentAttributes = paymentData.attributes || {}
  if (paymentData.relationships?.source?.data?.id) return paymentData.relationships.source.data.id
  if (paymentAttributes.source?.id) return paymentAttributes.source.id
  if (paymentAttributes.data?.id) return paymentAttributes.data.id
  return null
}

// Verify PayMongo webhook signature
function verifySignature(payload, signature, secret) {
  try {
    const hmac = crypto.createHmac("sha256", secret)
    hmac.update(payload)
    const computedSignature = hmac.digest("hex")
    return computedSignature === signature
  } catch (error) {
    console.error("Error verifying signature:", error)
    return false
  }
}

export async function POST(request) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get("paymongo-signature")

    if (!signature) {
      console.error("Missing PayMongo signature header")
      return NextResponse.json({ error: "Missing signature" }, { status: 401 })
    }

    let event
    try {
      event = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const paymentLinkIdEarly = extractPaymentLinkIdFromEvent(event)
    let ownerUidForWebhook = null
    if (paymentLinkIdEarly) {
      try {
        const bookingsRef = collection(db, "guestbooking")
        const q = query(bookingsRef, where("paymentLinkId", "==", paymentLinkIdEarly))
        const snap = await getDocs(q)
        if (!snap.empty) {
          ownerUidForWebhook = normalizeOwnerUid(snap.docs[0].data()?.ownerUid)
        }
      } catch (e) {
        console.error("Owner lookup for webhook:", e)
      }
    }

    const payCtx = await resolvePaymentForBooking(ownerUidForWebhook)
    const webhookSecret = payCtx.paymongoWebhookSecret
    if (!webhookSecret) {
      console.error("PayMongo webhook secret not configured (env or resort secrets)")
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
    }

    if (!verifySignature(rawBody, signature, webhookSecret)) {
      console.error("Invalid PayMongo signature")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    console.log("PayMongo webhook received:", event.type)

    // Handle payment.paid event
    if (event.type === "payment.paid") {
      const paymentData = event.data
      const paymentAttributes = paymentData.attributes

      console.log("Payment paid event received:", JSON.stringify(paymentData, null, 2))

      // Get payment link ID from the payment source
      // PayMongo webhook structure for payment.paid: event.data.relationships.source.data.id
      let paymentLinkId = null
      
      // Try different possible structures based on PayMongo API
      if (paymentData.relationships?.source?.data?.id) {
        paymentLinkId = paymentData.relationships.source.data.id
      } else if (paymentAttributes.source?.id) {
        paymentLinkId = paymentAttributes.source.id
      } else if (paymentAttributes.data?.id) {
        paymentLinkId = paymentAttributes.data.id
      }

      // Get payment amount (convert from centavos to pesos)
      const amountInCentavos = paymentAttributes.amount || paymentData.attributes?.amount || 0
      const amountInPesos = amountInCentavos / 100

      // Find booking by payment link ID or remarks
      // For payment links, we need to fetch the link to get remarks
      let bookingId = null

      // First try to find by payment link ID
      if (paymentLinkId) {
        try {
          const bookingsRef = collection(db, "guestbooking")
          const q = query(bookingsRef, where("paymentLinkId", "==", paymentLinkId))
          const querySnapshot = await getDocs(q)
          
          if (!querySnapshot.empty) {
            bookingId = querySnapshot.docs[0].id
            console.log(`Found booking ${bookingId} by payment link ID: ${paymentLinkId}`)
          }
        } catch (queryError) {
          console.error("Error querying by payment link ID:", queryError)
        }
      }

      // If not found, try to fetch payment link from PayMongo to get remarks
      if (!bookingId && paymentLinkId) {
        try {
          const paymongoCtx = await resolvePaymentForBooking(ownerUidForWebhook)
          const paymongoSecretKey = paymongoCtx.paymongoSecretKey
          if (paymongoSecretKey) {
            const authString = Buffer.from(paymongoSecretKey + ":").toString("base64")
            const linkResponse = await fetch(`https://api.paymongo.com/v1/links/${paymentLinkId}`, {
              headers: {
                Authorization: `Basic ${authString}`,
              },
            })
            
            if (linkResponse.ok) {
              const linkData = await linkResponse.json()
              const remarks = linkData.data?.attributes?.remarks
              
              if (remarks) {
                const match = remarks.match(/Booking ID:\s*([^\s]+)/i)
                if (match) {
                  bookingId = match[1]
                  console.log(`Found booking ID from payment link remarks: ${bookingId}`)
                }
              }
            }
          }
        } catch (fetchError) {
          console.error("Error fetching payment link:", fetchError)
        }
      }

      // Last resort: try to extract from payment attributes remarks if available
      if (!bookingId) {
        const remarks = paymentAttributes.remarks
        if (remarks) {
          const match = remarks.match(/Booking ID:\s*([^\s]+)/i)
          if (match) {
            bookingId = match[1]
            console.log(`Found booking ID from payment remarks: ${bookingId}`)
          }
        }
      }

      // Additional fallback: try to find by description/room name and dates
      if (!bookingId) {
        try {
          const description = paymentAttributes.description || ""
          // Extract room name and dates from description like "Booking Payment - Ocean View Family Room (2025-11-22 to 2025-11-23)"
          const descMatch = description.match(/Booking Payment\s*-\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\)/i)
          if (descMatch) {
            const roomName = descMatch[1].trim()
            const checkIn = descMatch[2]
            const checkOut = descMatch[3]
            
            console.log(`Trying to find booking by description: room="${roomName}", checkIn="${checkIn}", checkOut="${checkOut}"`)
            
            // Try to find booking by room name and dates
            const bookingsRef = collection(db, "guestbooking")
            const allBookingsSnapshot = await getDocs(bookingsRef)
            
            const matchingBooking = allBookingsSnapshot.docs.find(doc => {
              const data = doc.data()
              const bookingRoomType = (data.roomType || "").trim()
              const bookingCheckIn = data.checkIn || ""
              const bookingCheckOut = data.checkOut || ""
              
              // Match room name (case-insensitive, partial match)
              const roomMatch = bookingRoomType.toLowerCase().includes(roomName.toLowerCase()) || 
                               roomName.toLowerCase().includes(bookingRoomType.toLowerCase())
              
              // Match dates
              const dateMatch = bookingCheckIn === checkIn && bookingCheckOut === checkOut
              
              return roomMatch && dateMatch && data.status?.trim() === "Approved" && data.paymentStatus !== "paid"
            })
            
            if (matchingBooking) {
              bookingId = matchingBooking.id
              console.log(`✅ Found booking ${bookingId} by description matching`)
            }
          }
        } catch (fallbackError) {
          console.error("Error in fallback booking search:", fallbackError)
        }
      }

      if (!bookingId) {
        console.error("❌ Booking ID not found. Payment link ID:", paymentLinkId, "Amount:", amountInPesos)
        console.error("Payment description:", paymentAttributes.description)
        console.error("Payment remarks:", paymentAttributes.remarks)
        // Don't return error - just log it so webhook doesn't fail
        return NextResponse.json({ 
          message: "Payment received but booking not found. Please sync manually.",
          paymentLinkId: paymentLinkId,
          amount: amountInPesos
        })
      }

      // Update booking in Firestore
      try {
        const bookingDocRef = doc(db, "guestbooking", bookingId)

        // Get booking data to check current status and check-out date
        const bookingDoc = await getDoc(bookingDocRef)
        const bookingData = bookingDoc.exists() ? bookingDoc.data() : null

        // Update booking with payment information
        const updateData = {
          paymentStatus: "paid",
          paymentId: paymentData.id,
          paymentLinkId: paymentLinkId,
          paidAmount: amountInPesos,
          paidAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }

        // Check if booking check-out date has passed, auto-complete if so
        if (bookingData?.checkOut && bookingData.status?.trim() === "Approved") {
          const checkOutDate = new Date(bookingData.checkOut + "T00:00:00")
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          if (checkOutDate < today) {
            updateData.status = "Completed"
            updateData.updatedAt = serverTimestamp()
            console.log(`✅ Booking ${bookingId} will be auto-completed (check-out date passed)`)
          }
        }

        await updateDoc(bookingDocRef, updateData)

        console.log(`✅ Booking ${bookingId} marked as paid. Amount: ₱${amountInPesos}`)

        return NextResponse.json({ 
          success: true, 
          message: "Payment recorded successfully",
          bookingId: bookingId,
          amount: amountInPesos
        })
      } catch (firestoreError) {
        console.error("Error updating booking in Firestore:", firestoreError)
        return NextResponse.json(
          { error: "Failed to update booking", details: firestoreError.message },
          { status: 500 }
        )
      }
    }

    // Handle other event types if needed
    console.log(`Unhandled event type: ${event.type}`)
    return NextResponse.json({ message: "Event received but not processed" })
  } catch (error) {
    console.error("Error processing PayMongo webhook:", error)
    return NextResponse.json(
      { error: "Failed to process webhook", details: error.message },
      { status: 500 }
    )
  }
}

