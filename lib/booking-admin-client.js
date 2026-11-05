import { auth } from "@/lib/firebase"

export async function bookingAdminRequest(path, options = {}) {
  const user = auth?.currentUser
  if (!user) throw new Error("Please sign in again to manage bookings.")
  const idToken = await user.getIdToken()
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...options.headers,
    },
    cache: "no-store",
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Booking request failed (${response.status}).`)
  return data
}