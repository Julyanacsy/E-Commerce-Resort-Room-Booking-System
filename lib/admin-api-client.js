import { auth } from "@/lib/firebase"

export async function resortAdminRequest(path, payload, method = "POST") {
  const user = auth?.currentUser
  if (!user) throw new Error("Sign in again before making this change.")

  const token = await user.getIdToken()
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })

  let data
  try {
    data = await response.json()
  } catch {
    throw new Error("The server returned an invalid response.")
  }
  if (!response.ok) {
    throw new Error(data?.error || "The requested change could not be saved.")
  }
  return data
}
