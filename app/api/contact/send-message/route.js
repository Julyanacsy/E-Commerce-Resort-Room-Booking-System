import { NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import {
  resolveCentralEnvMail,
  resolveAdminInboxEmail,
  getResortAdminMailDisplayName,
} from "@/lib/central-env-mail"
import { normalizeOwnerUid } from "@/lib/booking-tenant"

export async function POST(request) {
  try {
    const { name, email, message, ownerUid: rawOwnerUid } = await request.json()
    const ownerUid = normalizeOwnerUid(rawOwnerUid)

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Name, email, and message are required" }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    let messageId
    try {
      const contactRef = collection(db, "contactMessages")
      const docRef = await addDoc(contactRef, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        message: message.trim(),
        status: "Unread",
        createdAt: serverTimestamp(),
        ...(ownerUid ? { ownerUid } : {}),
      })
      messageId = docRef.id
      console.log("Contact message saved:", { name, email, messageId })
    } catch (firestoreError) {
      console.error("Firestore error:", firestoreError)
      return NextResponse.json(
        { error: "Failed to save message", details: firestoreError.message },
        { status: 500 },
      )
    }

    try {
      const smtp = await resolveCentralEnvMail()
      if (!smtp.ok) {
        console.warn("Contact mail skipped:", smtp.code, smtp.message)
        return NextResponse.json({
          success: true,
          message: "Message saved. Email confirmation could not be sent (mail not configured).",
        })
      }

      const adminEmail = resolveAdminInboxEmail({
        brandingEmail: smtp.brandingEmail,
        replyTo: smtp.replyTo,
        smtpUser: smtp.user,
      })
      const brand = smtp.brandName
      const senderName = getResortAdminMailDisplayName()

      const userMailOptions = {
        from: `"${senderName}" <${smtp.user}>`,
        to: email.trim(),
        replyTo: smtp.replyTo,
        subject: `Thank You for Contacting ${brand}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
              <h2 style="color: #059669;">Thank You for Contacting Us!</h2>
              <p>Dear ${name.trim()},</p>
              <p>We have received your message and will get back to you as soon as possible.</p>
              <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #374151;"><strong>Your Message:</strong></p>
                <p style="margin: 10px 0 0 0; color: #6b7280; white-space: pre-wrap;">${message.trim()}</p>
              </div>
              <p>Our team typically responds within 24 hours. If your inquiry is urgent, please call us directly.</p>
              <p style="margin-top: 30px;">Best regards,<br/><strong>The ${brand} Team</strong></p>
            </div>
          `,
        text: `Dear ${name.trim()},\n\nWe have received your message and will get back to you as soon as possible.\n\nYour Message:\n${message.trim()}\n\nOur team typically responds within 24 hours. If your inquiry is urgent, please call us directly.\n\nBest regards,\nThe ${brand} Team`,
      }

      await smtp.transporter.sendMail(userMailOptions)
      console.log("Confirmation email sent to user:", email.trim())

      if (adminEmail) {
        const adminMailOptions = {
          from: `"${senderName}" <${smtp.user}>`,
          to: adminEmail,
          replyTo: smtp.replyTo,
          subject: `New Contact Message from ${name.trim()}`,
          html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #dc2626;">New Contact Message</h2>
                <p>You have received a new contact message from the website.</p>
                <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0;"><strong>Name:</strong> ${name.trim()}</p>
                  <p style="margin: 8px 0;"><strong>Email:</strong> ${email.trim()}</p>
                  <p style="margin: 8px 0 0 0;"><strong>Message:</strong></p>
                  <p style="margin: 10px 0 0 0; color: #374151; white-space: pre-wrap;">${message.trim()}</p>
                </div>
                <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">Message ID: ${messageId}</p>
                <p style="margin-top: 10px;">
                  <a href="${process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000/admin"}" style="display: inline-block; background-color: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View in Admin Panel</a>
                </p>
              </div>
            `,
          text: `New Contact Message\n\nName: ${name.trim()}\nEmail: ${email.trim()}\n\nMessage:\n${message.trim()}\n\nMessage ID: ${messageId}`,
        }

        await smtp.transporter.sendMail(adminMailOptions)
        console.log("Notification email sent to admin:", adminEmail)
      }
    } catch (emailError) {
      console.error("Error sending email:", emailError)
    }

    return NextResponse.json({
      success: true,
      message: "Message sent successfully",
    })
  } catch (error) {
    console.error("Error processing contact message:", error)
    return NextResponse.json(
      { error: "Failed to process message", details: error.message },
      { status: 500 },
    )
  }
}
