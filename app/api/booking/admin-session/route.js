import { authenticateBookingAdmin, jsonFailure } from "@/lib/booking-api-server"

export async function GET(request) {
  const authResult = await authenticateBookingAdmin(request)
  if (authResult.error) return jsonFailure(authResult.error, authResult.status)

  const { user } = authResult
  return Response.json({
    ownerUid: user.ownerUid,
    role: user.staffRole,
    isOwner: user.isOwner,
    isLegacyAdmin: user.isLegacyAdmin,
  })
}
