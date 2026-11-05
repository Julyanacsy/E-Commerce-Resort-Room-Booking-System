import { NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, getDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore"

export async function POST(request) {
  try {
    const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY
    if (!paymongoSecretKey) {
      return NextResponse.json(
        { error: "PAYMONGO_SECRET_KEY not configured" },
        { status: 500 }
      )
    }

    // Get all bookings that are approved but not paid
    const bookingsRef = collection(db, "guestbooking")
    const q = query(bookingsRef, where("status", "==", "Approved"))
    const bookingsSnapshot = await getDocs(q)

    const authString = Buffer.from(paymongoSecretKey + ":").toString("base64")
    let syncedCount = 0
    let errorCount = 0
    const errors = []

    // Fetch payments from PayMongo
    try {
      const paymentsResponse = await fetch("https://api.paymongo.com/v1/payments?limit=100", {
        headers: {
          Authorization: `Basic ${authString}`,
        },
      })

      if (!paymentsResponse.ok) {
        const errorData = await paymentsResponse.json()
        return NextResponse.json(
          { error: "Failed to fetch payments from PayMongo", details: errorData },
          { status: paymentsResponse.status }
        )
      }

      const paymentsData = await paymentsResponse.json()
      const payments = paymentsData.data || []

      console.log(`Found ${payments.length} payments in PayMongo`)

      // Process each payment
      for (const payment of payments) {
        const paymentAttributes = payment.attributes
        const paymentStatus = paymentAttributes.status

        // Only process paid payments
        if (paymentStatus !== "paid") {
          continue
        }

        // Get payment link ID
        let paymentLinkId = null
        if (payment.relationships?.source?.data?.id) {
          paymentLinkId = payment.relationships.source.data.id
        }

        // Get amount
        const amountInCentavos = paymentAttributes.amount || 0
        const amountInPesos = amountInCentavos / 100

        // Find booking by payment link ID
        let bookingId = null
        if (paymentLinkId) {
          const bookingQuery = query(bookingsRef, where("paymentLinkId", "==", paymentLinkId))
          const bookingSnapshot = await getDocs(bookingQuery)
          
          if (!bookingSnapshot.empty) {
            bookingId = bookingSnapshot.docs[0].id
          }
        }

        // If not found by payment link ID, try to get from payment link remarks
        if (!bookingId && paymentLinkId) {
          try {
            const linkResponse = await fetch(`https://api.paymongo.com/v1/links/${paymentLinkId}`, {
              headers: {
                Authorization: `Basic ${authString}`,
              },
            })
            
            if (linkResponse.ok) {
              const linkData = await linkResponse.json()
              const remarks = linkData.data?.attributes?.remarks
              const description = linkData.data?.attributes?.description || ""
              
              if (remarks) {
                const match = remarks.match(/Booking ID:\s*([^\s]+)/i)
                if (match) {
                  bookingId = match[1]
                }
              }
              
              // Fallback: try to find by description
              if (!bookingId && description) {
                const descMatch = description.match(/Booking Payment\s*-\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\)/i)
                if (descMatch) {
                  const roomName = descMatch[1].trim()
                  const checkIn = descMatch[2]
                  const checkOut = descMatch[3]
                  
                  // Try to find booking by room name and dates
                  const matchingBooking = bookingsSnapshot.docs.find(doc => {
                    const data = doc.data()
                    const bookingRoomType = (data.roomType || "").trim()
                    const bookingCheckIn = data.checkIn || ""
                    const bookingCheckOut = data.checkOut || ""
                    
                    const roomMatch = bookingRoomType.toLowerCase().includes(roomName.toLowerCase()) || 
                                     roomName.toLowerCase().includes(bookingRoomType.toLowerCase())
                    const dateMatch = bookingCheckIn === checkIn && bookingCheckOut === checkOut
                    
                    return roomMatch && dateMatch && data.status?.trim() === "Approved" && data.paymentStatus !== "paid"
                  })
                  
                  if (matchingBooking) {
                    bookingId = matchingBooking.id
                    console.log(`✅ Found booking ${bookingId} by description matching`)
                  }
                }
              }
            }
          } catch (fetchError) {
            console.error("Error fetching payment link:", fetchError)
          }
        }

        // Additional fallback: try to find by payment description
        if (!bookingId) {
          try {
            const description = paymentAttributes.description || ""
            // Extract room name and dates from description like "Booking Payment - Ocean View Family Room (2025-11-22 to 2025-11-23)"
            const descMatch = description.match(/Booking Payment\s*-\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\)/i)
            if (descMatch) {
              const roomName = descMatch[1].trim()
              const checkIn = descMatch[2]
              const checkOut = descMatch[3]
              
              console.log(`Trying to find booking by payment description: room="${roomName}", checkIn="${checkIn}", checkOut="${checkOut}"`)
              
              // Try to find booking by room name and dates
              const matchingBooking = bookingsSnapshot.docs.find(doc => {
                const data = doc.data()
                const bookingRoomType = (data.roomType || "").trim()
                const bookingCheckIn = data.checkIn || ""
                const bookingCheckOut = data.checkOut || ""
                
                // Match room name (case-insensitive, partial match)
                const roomMatch = bookingRoomType.toLowerCase().includes(roomName.toLowerCase()) || 
                                 roomName.toLowerCase().includes(bookingRoomType.toLowerCase()) ||
                                 roomName.toLowerCase() === "wala" // Handle "WALA" case
                
                // Match dates
                const dateMatch = bookingCheckIn === checkIn && bookingCheckOut === checkOut
                
                return roomMatch && dateMatch && data.status?.trim() === "Approved" && data.paymentStatus !== "paid"
              })
              
              if (matchingBooking) {
                bookingId = matchingBooking.id
                console.log(`✅ Found booking ${bookingId} by payment description matching`)
              }
            }
          } catch (fallbackError) {
            console.error("Error in fallback booking search:", fallbackError)
          }
        }

        // If booking found and not yet marked as paid, update it
        if (bookingId) {
          try {
            const bookingRef = doc(db, "guestbooking", bookingId)
            const bookingDoc = await getDoc(bookingRef)
            
            if (bookingDoc.exists()) {
              const bookingData = bookingDoc.data()
              
              // Only update if not already paid
              if (bookingData.paymentStatus !== "paid") {
                const updateData = {
                  paymentStatus: "paid",
                  paymentId: payment.id,
                  paymentLinkId: paymentLinkId,
                  paidAmount: amountInPesos,
                  paidAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                }

                await updateDoc(bookingRef, updateData)
                syncedCount++
                console.log(`✅ Synced payment for booking ${bookingId}: ₱${amountInPesos}`)
              }
            }
          } catch (updateError) {
            errorCount++
            errors.push(`Booking ${bookingId}: ${updateError.message}`)
            console.error(`❌ Error updating booking ${bookingId}:`, updateError)
          }
        } else {
          console.warn(`⚠️ No booking found for payment ${payment.id} (Link ID: ${paymentLinkId})`)
        }
      }

      return NextResponse.json({
        success: true,
        message: `Payment sync completed`,
        synced: syncedCount,
        errors: errorCount,
        errorDetails: errors.length > 0 ? errors : undefined,
      })
    } catch (fetchError) {
      console.error("Error fetching payments:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch payments", details: fetchError.message },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Error syncing payments:", error)
    return NextResponse.json(
      { error: "Failed to sync payments", details: error.message },
      { status: 500 }
    )
  }
}

