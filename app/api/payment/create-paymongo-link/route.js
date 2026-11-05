import { NextResponse } from "next/server"

export async function POST(request) {
  try {
    const { amount, bookingId, name, email, roomType, checkIn, checkOut } = await request.json()

    if (!amount || !bookingId || !name || !email) {
      return NextResponse.json(
        { error: "Amount, bookingId, name, and email are required" },
        { status: 400 }
      )
    }

    // PayMongo API credentials
    const paymongoSecretKey = process.env.PAYMONGO_SECRET_KEY
    if (!paymongoSecretKey) {
      return NextResponse.json(
        { error: "PayMongo secret key not configured" },
        { status: 500 }
      )
    }

    // Convert amount to centavos (PayMongo uses smallest currency unit)
    const amountInCentavos = Math.round(amount * 100)

    // Create payment link via PayMongo API
    // PayMongo uses Basic Auth with secret key (no password needed)
    const authString = Buffer.from(paymongoSecretKey + ":").toString("base64")
    
    const paymongoResponse = await fetch("https://api.paymongo.com/v1/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountInCentavos,
            currency: "PHP",
            description: `Booking Payment - ${roomType} (${checkIn} to ${checkOut})`,
            remarks: `Booking ID: ${bookingId}`,
          },
        },
      }),
    })

    const paymongoData = await paymongoResponse.json()

    if (!paymongoResponse.ok) {
      console.error("PayMongo API error:", paymongoData)
      return NextResponse.json(
        { error: "Failed to create payment link", details: paymongoData.errors?.[0]?.detail || "Unknown error" },
        { status: 500 }
      )
    }

    // Extract payment link
    const paymentLink = paymongoData.data?.attributes?.checkout_url

    if (!paymentLink) {
      return NextResponse.json(
        { error: "Payment link not found in response" },
        { status: 500 }
      )
    }

    console.log("PayMongo payment link created:", paymentLink)

    return NextResponse.json({
      success: true,
      paymentLink: paymentLink,
      paymentId: paymongoData.data?.id,
    })
  } catch (error) {
    console.error("Error creating PayMongo payment link:", error)
    return NextResponse.json(
      { error: "Failed to create payment link", details: error.message },
      { status: 500 }
    )
  }
}

