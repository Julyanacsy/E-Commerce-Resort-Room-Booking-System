import {
  authenticateBookingAdmin,
  getBookingDb,
  jsonFailure,
} from "@/lib/booking-api-server"

const MAX_AUDIT_PAGE_SIZE = 100

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)
  if (!authResult.user.isOwner) return jsonFailure("Only the resort admin can view the audit log.", 403)

  const db = getBookingDb()
  if (!db) return jsonFailure("Firebase Admin credentials are not configured.", 503)

  try {
    const auditLogs = db
      .collection("resortOwners")
      .doc(authResult.user.ownerUid)
      .collection("auditLogs")
    let query = auditLogs.orderBy("createdAt", "desc").limit(MAX_AUDIT_PAGE_SIZE + 1)
    const cursorId = String(new URL(request.url).searchParams.get("cursor") || "")
    if (cursorId) {
      if (cursorId.includes("/") || cursorId.length > 150) return jsonFailure("Invalid audit log cursor.", 400)
      const cursor = await auditLogs.doc(cursorId).get()
      if (!cursor.exists) return jsonFailure("Audit log cursor was not found.", 400)
      query = query.startAfter(cursor)
    }
    const snapshot = await query.get()
    const page = snapshot.docs.slice(0, MAX_AUDIT_PAGE_SIZE)
    const entries = page.map((item) => ({
      id: item.id,
      ...item.data(),
      createdAt: item.get("createdAt")?.toDate?.().toISOString() || null,
    }))
    return Response.json({
      entries,
      nextCursor: snapshot.size > MAX_AUDIT_PAGE_SIZE ? page.at(-1)?.id || null : null,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load resort audit log:", error)
    return jsonFailure("Audit log could not be loaded.", 500)
  }
}
