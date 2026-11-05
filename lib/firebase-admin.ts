/**
 * Optional Firebase Admin — required for server routes to read per-resort payment docs under resortOwners.
 * Set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON of a service account (single line in .env).
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

let adminApp: App | null = null
let adminDb: Firestore | null = null

export function getAdminFirestore(): Firestore | null {
  if (adminDb) return adminDb
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw?.trim()) return null
  try {
    const cred = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string }
    if (!cred?.private_key || !cred?.client_email) {
      console.error("[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON missing private_key or client_email")
      return null
    }
    if (!getApps().length) {
      adminApp = initializeApp({ credential: cert(cred) })
    } else {
      adminApp = getApps()[0]!
    }
    adminDb = getFirestore(adminApp)
    return adminDb
  } catch (e) {
    console.error("[firebase-admin] Init failed:", e)
    return null
  }
}
