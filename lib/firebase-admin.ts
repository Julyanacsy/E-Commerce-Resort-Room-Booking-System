/**
 * Firebase Admin — required for privileged server-side booking and payment routes.
 * Set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON of a service account (single line in .env).
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

let adminApp: App | null = null
let adminDb: Firestore | null = null
let adminAuth: Auth | null = null

export function getAdminFirestore(): Firestore | null {
  if (adminDb) return adminDb
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw?.trim()) return null
  try {
    const rawCredential = JSON.parse(raw) as {
      project_id?: string
      client_email?: string
      private_key?: string
    }
    if (!rawCredential?.project_id || !rawCredential?.private_key || !rawCredential?.client_email) {
      console.error("[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON missing project_id, private_key, or client_email")
      return null
    }
    const credential = {
      projectId: rawCredential.project_id,
      clientEmail: rawCredential.client_email,
      privateKey: rawCredential.private_key.replace(/\\n/g, "\n"),
    }
    if (!getApps().length) {
      adminApp = initializeApp({ credential: cert(credential) })
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

export function getAdminAuth(): Auth | null {
  if (adminAuth) return adminAuth
  const db = getAdminFirestore()
  if (!db || !adminApp) return null
  adminAuth = getAuth(adminApp)
  return adminAuth
}
