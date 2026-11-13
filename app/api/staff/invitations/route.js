import { getAdminAuth } from "@/lib/firebase-admin"
import { isApprovedStaffInvitation } from "@/lib/booking-domain.mjs"
import { resolveCentralEnvMail } from "@/lib/central-env-mail"
import {
  authenticateBookingAdmin,
  getBookingDb,
  getStaffInvitationIndexError,
  jsonFailure,
} from "@/lib/booking-api-server"
import {
  writeResortAdminEvent,
  writeResortAdminAudit,
} from "@/lib/resort-admin-events.mjs"

const STAFF_ROLES = new Set(["admin", "front-desk", "finance"])
const EMAIL_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character])
}

function getPublicBaseUrl() {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || "").trim()
  if (explicit) return explicit.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

function getRoleLabel(role) {
  if (role === "front-desk") return "Front desk"
  if (role === "finance") return "Finance"
  return "Admin"
}

async function getRegisteredUser(adminAuth, email) {
  try {
    return await adminAuth.getUserByEmail(email)
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null
    throw error
  }
}

function isPendingInvitation(invitation) {
  return String(invitation?.status || "").toLowerCase() === "pending"
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
          name: String(invitation.name || ""),
          contact: String(invitation.contact || ""),
          role: String(invitation.role || ""),
          status: String(invitation.status || (invitation.active === true ? "approved" : "revoked")),
          active: isApprovedStaffInvitation(invitation),
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
  const adminAuth = getAdminAuth()
  if (!db || !adminAuth) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }

  const action = String(body?.action || "")
  const email = String(body?.email || "").trim().toLowerCase()
  const role = String(body?.role || "").trim()
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return jsonFailure("Enter a valid staff email address.", 400)
  }
  if (action === "invite" && !STAFF_ROLES.has(role)) {
    return jsonFailure("Choose a valid staff role.", 400)
  }
  if (!["lookup", "invite", "approve", "revoke"].includes(action)) {
    return jsonFailure("Staff action is invalid.", 400)
  }

  const ownerUid = authResult.user.ownerUid
  const invitationRef = db
    .collection("resortOwners")
    .doc(ownerUid)
    .collection("staffInvitations")
    .doc(email)

  try {
    if (action === "lookup") {
      const registeredUser = await getRegisteredUser(adminAuth, email)
      return Response.json({ registered: Boolean(registeredUser) })
    }

    if (action === "invite") {
      const [registeredUser, existingInvitation, matches] = await Promise.all([
        getRegisteredUser(adminAuth, email),
        invitationRef.get(),
        db.collectionGroup("staffInvitations").where("email", "==", email).get(),
      ])
      const name = String(body?.name || "").trim()
      const contact = String(body?.contact || "").trim()
      if (name.length > 100 || contact.length > 100) {
        return jsonFailure("Name and contact details must be 100 characters or fewer.", 400)
      }
      if (!registeredUser && (!name || !contact)) {
        return jsonFailure("Enter the new staff member's name and contact details.", 400)
      }

      const ownerAccount = registeredUser
        ? await db.collection("resortOwners").doc(registeredUser.uid).get()
        : null
      if (ownerAccount?.exists) {
        return jsonFailure("A resort owner account cannot be converted into staff.", 409)
      }

      const currentInvitation = existingInvitation.exists ? existingInvitation.data() : null
      if (currentInvitation && (isPendingInvitation(currentInvitation) || isApprovedStaffInvitation(currentInvitation))) {
        return jsonFailure("This email already has a pending or approved staff record.", 409)
      }

      const alreadyAssignedElsewhere = matches.docs.some((item) => {
        const invitation = item.data()
        return invitation.ownerUid !== ownerUid
          && (isPendingInvitation(invitation) || isApprovedStaffInvitation(invitation))
      })
      if (alreadyAssignedElsewhere) {
        return jsonFailure("This account already has staff access at another resort.", 409)
      }

      let staffUser = registeredUser
      let createdAuthUser = false
      if (!staffUser) {
        staffUser = await adminAuth.createUser({
          email,
          displayName: name,
          emailVerified: false,
        })
        createdAuthUser = true
      }

      const staffName = name || staffUser.displayName || ""
      try {
        await db.runTransaction(async (transaction) => {
          const current = await transaction.get(invitationRef)
          if (current.exists) {
            const currentData = current.data()
            if (isPendingInvitation(currentData) || isApprovedStaffInvitation(currentData)) {
              const error = new Error("This email already has a pending or approved staff record.")
              error.status = 409
              throw error
            }
          }
          transaction.set(invitationRef, {
            email,
            uid: staffUser.uid,
            name: staffName,
            contact,
            ownerUid,
            role,
            status: "pending",
            active: false,
            createdAt: new Date(),
            createdBy: authResult.user.uid,
            updatedAt: new Date(),
          }, { merge: true })
          writeResortAdminEvent(transaction, db, {
            ownerUid,
            actorUid: authResult.user.uid,
            actorEmail: authResult.user.email,
            actorRole: authResult.user.staffRole,
            action: "staff.invited",
            entityType: "staff",
            entityId: staffUser.uid,
            summary: `A new ${getRoleLabel(role)} staff account is pending approval.`,
            after: { role, status: "pending" },
            notification: {
              type: "staff.pending-approval",
              title: "Staff approval needed",
              message: `${staffName || getRoleLabel(role)} is waiting for approval as ${getRoleLabel(role)}.`,
            },
          })
        })
      } catch (error) {
        if (createdAuthUser) {
          try {
            await adminAuth.deleteUser(staffUser.uid)
          } catch (cleanupError) {
            console.error("Failed to remove an unlinked staff auth account:", cleanupError)
          }
        }
        throw error
      }

      return Response.json({
        success: true,
        email,
        role,
        status: "pending",
        registered: Boolean(registeredUser),
      })
    }

    if (action === "revoke") {
      const invitationSnapshot = await invitationRef.get()
      if (!invitationSnapshot.exists) return jsonFailure("Staff record was not found.", 404)
      const revokedStaffUid = String(invitationSnapshot.get("uid") || "")
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(invitationRef)
        if (!current.exists) {
          const error = new Error("Staff record was not found.")
          error.status = 404
          throw error
        }
        transaction.set(invitationRef, {
          status: "revoked",
          active: false,
          updatedAt: new Date(),
          updatedBy: authResult.user.uid,
        }, { merge: true })
        writeResortAdminAudit(transaction, db, {
          ownerUid,
          actorUid: authResult.user.uid,
          actorEmail: authResult.user.email,
          actorRole: authResult.user.staffRole,
          action: "staff.revoked",
          entityType: "staff",
          entityId: revokedStaffUid,
          summary: "Staff access was revoked.",
          before: { role: String(current.get("role") || ""), status: String(current.get("status") || "") },
          after: { status: "revoked" },
          emailRecipients: [String(current.get("email") || email)],
        })
      })
      return Response.json({ success: true, status: "revoked" })
    }

    const invitationSnapshot = await invitationRef.get()
    if (!invitationSnapshot.exists) return jsonFailure("Staff record was not found.", 404)
    const invitation = invitationSnapshot.data()
    if (String(invitation.status || "").toLowerCase() === "revoked") {
      return jsonFailure("Revoked staff access must be re-invited before approval.", 409)
    }
    if (!isPendingInvitation(invitation) && !isApprovedStaffInvitation(invitation)) {
      return jsonFailure("Only pending staff can be approved.", 409)
    }

    const staffUser = invitation.uid
      ? await adminAuth.getUser(String(invitation.uid))
      : await getRegisteredUser(adminAuth, email)
    if (!staffUser || staffUser.email?.toLowerCase() !== email) {
      return jsonFailure("The staff account could not be resolved for this email.", 409)
    }

    const mail = await resolveCentralEnvMail()
    if (!mail.ok) {
      console.error("Staff onboarding email unavailable:", mail.code, mail.message)
      return jsonFailure("Staff access was not approved because email is not configured.", 503)
    }

    const actionCodeSettings = {
      url: `${getPublicBaseUrl()}/staff`,
      handleCodeInApp: false,
    }
    const [passwordSetupLink, verificationLink] = await Promise.all([
      adminAuth.generatePasswordResetLink(email, actionCodeSettings),
      adminAuth.generateEmailVerificationLink(email, actionCodeSettings),
    ])
    const roleLabel = getRoleLabel(String(invitation.role || ""))
    const setupMessage = `Your resort staff account as ${roleLabel} has been approved. Set your password, then verify your email to sign in to the resort admin portal.`
    await mail.transporter.sendMail({
      from: `"${mail.brandName}" <${mail.user}>`,
      to: email,
      replyTo: mail.replyTo,
      subject: "Your resort staff account is approved",
      text: `${setupMessage}\n\nSet your password: ${passwordSetupLink}\n\nVerify your email: ${verificationLink}`,
      html: `<p>${escapeHtml(setupMessage)}</p><p><a href="${escapeHtml(passwordSetupLink)}">Set your password</a></p><p><a href="${escapeHtml(verificationLink)}">Verify your email</a></p><p>After completing both steps, sign in at <a href="${escapeHtml(`${getPublicBaseUrl()}/admin`)}">the admin portal</a>.</p>`,
    })

    const notificationRef = db
      .collection("resortOwners")
      .doc(ownerUid)
      .collection("staffNotifications")
      .doc()
    await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(invitationRef)
      if (!latestSnapshot.exists) {
        const error = new Error("Staff record was not found.")
        error.status = 404
        throw error
      }
      const latestInvitation = latestSnapshot.data()
      if (String(latestInvitation.status || "").toLowerCase() === "revoked") {
        const error = new Error("Staff access was revoked before approval completed.")
        error.status = 409
        throw error
      }
      if (isPendingInvitation(latestInvitation)) {
        transaction.set(invitationRef, {
          status: "approved",
          active: true,
          approvedAt: new Date(),
          approvedBy: authResult.user.uid,
          updatedAt: new Date(),
        }, { merge: true })
        transaction.create(notificationRef, {
          staffUid: staffUser.uid,
          title: "Staff access approved",
          message: `Your ${roleLabel} access has been approved. Check your email to set your password and verify your account.`,
          read: false,
          createdAt: new Date(),
        })
        writeResortAdminAudit(transaction, db, {
          ownerUid,
          actorUid: authResult.user.uid,
          actorEmail: authResult.user.email,
          actorRole: authResult.user.staffRole,
          action: "staff.approved",
          entityType: "staff",
          entityId: staffUser.uid,
          summary: `A ${roleLabel} staff account was approved.`,
          before: { role: String(latestInvitation.role || ""), status: "pending" },
          after: { status: "approved" },
        })
      } else if (!isApprovedStaffInvitation(latestInvitation)) {
        const error = new Error("Only pending staff can be approved.")
        error.status = 409
        throw error
      }
    })

    return Response.json({ success: true, email, status: "approved" })
  } catch (error) {
    if (Number.isInteger(error?.status)) return jsonFailure(error.message, error.status)
    const indexError = getStaffInvitationIndexError(error)
    if (indexError) {
      console.error("Staff management requires a Firestore collection-group index:", error)
      return jsonFailure(indexError, 503)
    }
    console.error("Failed to manage staff access:", error)
    return jsonFailure("Staff access could not be updated.", 502)
  }
}
