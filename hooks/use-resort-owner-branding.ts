"use client"

import { useCallback, useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { doc, onSnapshot, setDoc, type DocumentData } from "firebase/firestore"
import { BRANDING_DEFAULTS, type Branding } from "@/hooks/use-branding"

function brandingDocRef(ownerUid: string) {
  return doc(db, "resortOwners", ownerUid, "site", "branding")
}

/**
 * Per–resort-owner branding (Resort Admin + public landing `?o=` / `/stay/`).
 * Document: `resortOwners/{ownerUid}/site/branding`
 * When `ownerUid` is null/empty, returns `branding: null` so callers can fall back to global branding.
 */
export function useResortOwnerBranding(ownerUid: string | null) {
  const [branding, setBranding] = useState<Branding | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!db || !ownerUid) {
      setBranding(null)
      setLoading(false)
      return
    }

    const ref = brandingDocRef(ownerUid)
    setLoading(true)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<Branding> & Record<string, unknown>
          const merged: Branding = {
            ...BRANDING_DEFAULTS,
            ...data,
            tabTitle: data.tabTitle ?? "",
            favicon: data.favicon ?? "",
          }
          // Missing keys ≠ “use LuxeStay template” for contact — empty inputs unless saved.
          if (!("address" in data)) merged.address = ""
          if (!("phone" in data)) merged.phone = ""
          if (!("email" in data)) merged.email = ""
          if (!("tagline" in data)) merged.tagline = ""
          if (!("facebook" in data)) merged.facebook = ""
          if (!("twitter" in data)) merged.twitter = ""
          if (!("linkedin" in data)) merged.linkedin = ""
          setBranding(merged)
        } else {
          setBranding(null)
        }
        setLoading(false)
      },
      () => {
        setBranding(null)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [ownerUid])

  const updateBranding = useCallback(async (payload: DocumentData) => {
    if (!db || !ownerUid) throw new Error("Resort owner not loaded")
    await setDoc(brandingDocRef(ownerUid), payload, { merge: true })
  }, [ownerUid])

  return { branding, updateBranding, loading }
}
