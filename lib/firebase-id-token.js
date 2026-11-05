import { firebasePublicConfig } from "@/lib/firebase-public-config"

/**
 * Verify a Firebase ID token (client session) via Identity Toolkit.
 * @returns {Promise<{ uid: string, email: string } | null>}
 */
export async function getAccountFromIdToken(idToken) {
  const token = String(idToken || "").trim()
  if (!token) return null
  const apiKey = firebasePublicConfig.apiKey
  if (!apiKey) return null

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  })
  const data = await res.json().catch(() => ({}))
  const u = data?.users?.[0]
  if (!u?.localId) return null
  return {
    uid: String(u.localId),
    email: String(u.email || "")
      .trim()
      .toLowerCase(),
  }
}
