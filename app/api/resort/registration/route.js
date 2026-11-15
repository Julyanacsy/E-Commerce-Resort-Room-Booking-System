import { getAdminAuth } from "@/lib/firebase-admin"
import {
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"
import {
  writePlatformAdminNotification,
  writeResortAdminAudit,
} from "@/lib/resort-admin-events.mjs"

export async function POST(request) {
  const authorization = request.headers.get("authorization") || ""
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i)
  if (!tokenMatch) return jsonFailure("Authentication required.", 401)

  const adminAuth = getAdminAuth()
  const db = getBookingDb()
  if (!adminAuth || !db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  let decoded
  try {
    decoded = await adminAuth.verifyIdToken(tokenMatch[1])
  } catch (error) {
    console.error("Resort registration token verification failed:", error)
    return jsonFailure("Authentication token is invalid or expired.", 401)
  }
  if (!decoded.email || decoded.email_verified !== true) {
    return jsonFailure("A verified email address is required.", 403)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonFailure("Invalid JSON request.", 400)
  }

  const uid = String(decoded.uid || "")
  const email = String(decoded.email || "").trim().toLowerCase()
  const ownerRef = db.collection("resortOwners").doc(uid)
  const resortRef = db.collection("resorts").doc(uid)
  const actor = {
    ownerUid: uid,
    actorUid: uid,
    actorEmail: email,
    actorRole: "owner-applicant",
  }

  try {
    if (body?.action === "owner.request") {
      let alreadyApproved = false
      await db.runTransaction(async (transaction) => {
        const ownerSnapshot = await transaction.get(ownerRef)
        const current = ownerSnapshot.data() || {}
        if (String(current.status || "").toLowerCase() === "approved") {
          alreadyApproved = true
          return
        }
        const status = String(current.status || "pending")
        transaction.set(ownerRef, {
          uid,
          email,
          displayName: String(decoded.name || current.displayName || "").slice(0, 120),
          photoURL: String(decoded.picture || current.photoURL || "").slice(0, 2000),
          role: "owner",
          status: "pending",
          updatedAt: new Date(),
          ...(ownerSnapshot.exists ? {} : { createdAt: new Date() }),
        }, { merge: true })
        writeResortAdminAudit(transaction, db, {
          ...actor,
          action: "owner.application-submitted",
          entityType: "resort-owner",
          entityId: uid,
          summary: ownerSnapshot.exists
            ? "Resort owner application was resubmitted."
            : "Resort owner application was submitted.",
          before: { status },
          after: { status: "pending" },
        })
        writePlatformAdminNotification(transaction, db, {
          type: "owner.application-submitted",
          title: "New resort owner application",
          message: `${String(decoded.name || email).slice(0, 160)} submitted a resort owner application.`,
          ownerUid: uid,
          actorUid: uid,
        })
      })
      return Response.json({ success: true, alreadyApproved })
    }

    if (body?.action !== "registration.submit") {
      return jsonFailure("A valid registration action is required.", 400)
    }
    const registration = body.registration
    const name = String(registration?.name || "").trim()
    const location = String(registration?.location || "").trim()
    const mapsUrl = String(registration?.mapsUrl || "").trim()
    const description = String(registration?.description || "").trim()
    const validMapsUrl = mapsUrl.length <= 2000 && (
      mapsUrl.includes("google.com/maps")
      || mapsUrl.includes("maps.app.goo.gl")
      || mapsUrl.includes("goo.gl/maps")
    )
    if (
      !name || name.length > 120
      || !location || location.length > 300
      || !validMapsUrl
      || description.length > 3000
    ) return jsonFailure("Enter a resort name, location, and valid Google Maps link.", 400)

    await db.runTransaction(async (transaction) => {
      const [ownerSnapshot, resortSnapshot] = await Promise.all([
        transaction.get(ownerRef),
        transaction.get(resortRef),
      ])
      if (!ownerSnapshot.exists) {
        const error = new Error("Submit the owner application before registering the resort.")
        error.status = 409
        throw error
      }
      if (String(ownerSnapshot.get("status") || "").toLowerCase() === "approved") {
        const error = new Error("Approved resort owners cannot resubmit registration details.")
        error.status = 409
        throw error
      }
      const previous = resortSnapshot.data() || {}
      transaction.set(resortRef, {
        id: uid,
        ownerUid: uid,
        ownerEmail: email,
        name,
        location,
        mapsUrl,
        description,
        status: "pending",
        updatedAt: new Date(),
        ...(resortSnapshot.exists ? {} : { createdAt: new Date() }),
      }, { merge: true })
      writeResortAdminAudit(transaction, db, {
        ...actor,
        action: "resort.registration-submitted",
        entityType: "resort-listing",
        entityId: uid,
        summary: "Resort registration details were submitted for review.",
        before: { status: String(previous.status || "not-submitted") },
        after: { status: "pending", name },
      })
      writePlatformAdminNotification(transaction, db, {
        type: "resort.registration-submitted",
        title: "Resort registration needs review",
        message: `${name} submitted resort registration details for review.`,
        resortId: uid,
        ownerUid: uid,
        actorUid: uid,
      })
    })
    return Response.json({ success: true })
  } catch (error) {
    if (Number.isInteger(error?.status)) return jsonFailure(error.message, error.status)
    console.error("Failed to save resort registration:", error)
    return jsonFailure("Resort registration could not be saved.", 500)
  }
}
