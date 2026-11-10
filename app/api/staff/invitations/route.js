import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import {
  authenticateBookingAdmin,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

const STAFF_ROLES = new Set(["admin", "front-desk", "finance"])

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character])
}

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!authResult.user.isOwner) return jsonFailure("Only the resort owner can manage staff.", 403)
  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const snapshot = await db
      .collection("resortOwners")
      .doc(authResult.user.ownerUid)
      .collection("staffInvitations")
      .get()
    const staff = snapshot.docs
      .map((item) => {
        const invitation = item.data()
        return {
          email: String(invitation.email || item.id),
          role: String(invitation.role || ""),
          active: invitation.active === true,
          invitedAt: invitation.createdAt?.toDate?.().toISOString() || null,
        }
      })
      .sort((a, b) => a.email.localeCompare(b.email))
    return Response.json({ staff })
  } catch (error) {
    console.error("Failed to load staff invitations:", error)
    return jsonFailure("Staff access could not be loaded.", 500)
  }
}

export async function POST(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!authResult.user.isOwner) return jsonFailure("Only the resort owner can manage staff.", 403)

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)
  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }

  const action = String(body?.action || "invite")
  const email = String(body?.email || "").trim().toLowerCase()
  const role = String(body?.role || "").trim()
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email) || email.length > 254) {
    return jsonFailure("Enter a valid staff email address.", 400)
  }
  if (action === "invite" && !STAFF_ROLES.has(role)) {
    return jsonFailure("Choose a valid staff role.", 400)
  }
  if (!["invite", "revoke"].includes(action)) return jsonFailure("Staff action is invalid.", 400)

  try {
    const invitationRef = db
      .collection("resortOwners")
      .doc(authResult.user.ownerUid)
      .collection("staffInvitations")
      .doc(email)
    if (action === "revoke") {
      await invitationRef.set({
        email,
        ownerUid: authResult.user.ownerUid,
        active: false,
        updatedAt: new Date(),
        updatedBy: authResult.user.uid,
      }, { merge: true })
      return Response.json({ success: true })
    }

    await invitationRef.set({
      email,
      ownerUid: authResult.user.ownerUid,
      role,
      active: true,
      createdAt: new Date(),
      createdBy: authResult.user.uid,
      updatedAt: new Date(),
    })

    const mail = await resolveCentralEnvMail()
    if (!mail.ok) {
      console.error("Staff invitation email unavailable:", mail.code, mail.message)
      return jsonFailure("Invitation saved, but email is not configured.", 503)
    }
    const roleLabel = role === "front-desk" ? "Front desk" : role === "finance" ? "Finance" : "Admin"
    const message = `You have been invited to the resort booking admin as ${roleLabel}. Open the resort website, choose Admin, and sign in with Google using this email address: ${email}.`
    await mail.transporter.sendMail({
      from: `"${mail.brandName}" <${mail.user}>`,
      to: email,
      replyTo: mail.replyTo,
      subject: `Staff access invitation: ${roleLabel}`,
      text: message,
      html: `<p>${escapeHtml(message)}</p>`,
    })
    return Response.json({ success: true, email, role })
  } catch (error) {
    console.error("Failed to save or send staff invitation:", error)
    return jsonFailure("Staff invitation could not be saved or sent.", 502)
  }
}
