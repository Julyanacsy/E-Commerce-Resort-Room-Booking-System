"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { doc, onSnapshot } from "firebase/firestore"

export const MARKETPLACE_DOC_ID = "marketplace"

export type MarketplaceSettings = {
  navTitle: string
  navSubtitle: string
  /** Header + tab icon on `/resorts` only. Super admin via `settings/marketplace`. Empty = `/icon.svg`. */
  navLogoUrl: string
  /**
   * Browser tab title app-wide (super admin). Used for `/resorts`, default home tab, and as suffix on resort sites
   * (`Resort name — siteTabTitle`). Empty = derive marketplace tab from nav title + subtitle.
   */
  siteTabTitle: string
  /** Optional favicon URL for all guest-facing pages. Empty = use nav logo URL, then `/icon.svg`. */
  siteFaviconUrl: string
  heroEyebrow: string
  heroHeadline: string
  heroSubheadline: string
  searchPlaceholder: string
  featurePills: string[]
  partnerEyebrow: string
  partnerHeadline: string
  partnerBody: string
  /** When false, only real Firestore-backed listings are shown (no mock demo cards). */
  showDemoResorts: boolean
  /** Shown when there are no listings (or search/filter has no matches). */
  emptyListTitle: string
  emptyListSubtext: string
  /**
   * Firebase Auth UID for the legacy helpdesk account whose `rooms` were created
   * without `ownerUid`. Those rooms are grouped under this UID on `/resorts` and `/stay/{uid}`.
   * Firestore `settings/marketplace.legacyUnscopedRoomsOwnerUid` overrides
   * `NEXT_PUBLIC_LEGACY_UNSCOPED_ROOMS_OWNER_UID` when set.
   */
  legacyUnscopedRoomsOwnerUid: string
}

export const MARKETPLACE_DEFAULTS: MarketplaceSettings = {
  navTitle: "Resort Marketplace",
  navSubtitle: "Choose your resort",
  navLogoUrl: "",
  siteTabTitle: "",
  siteFaviconUrl: "",
  heroEyebrow: "Marketplace",
  heroHeadline: "Discover resorts you'll love",
  heroSubheadline:
    "Search by name, location, or amenities. Pick a resort to view details and book.",
  searchPlaceholder: "Try: Palawan, beachfront, spa…",
  featurePills: ["Fast approval", "Verified listings", "Secure booking"],
  partnerEyebrow: "Partner with us",
  partnerHeadline: "You want to join?",
  partnerBody:
    "Create your resort account using Google, then submit your resort details for review.",
  showDemoResorts: false,
  emptyListTitle: "No resorts listed yet",
  emptyListSubtext:
    "Published resorts appear here (approved listings, older accounts without a status field, and hosts with live rooms). New partners register below — a super admin approves each new listing before it shows.",
  legacyUnscopedRoomsOwnerUid: "",
}

export function mergeMarketplaceFromFirestore(data: Record<string, unknown>): MarketplaceSettings {
  const pillsRaw = data.featurePills
  const featurePills = Array.isArray(pillsRaw)
    ? pillsRaw
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
    : MARKETPLACE_DEFAULTS.featurePills

  const str = (k: string, fallback: string) => {
    const v = data[k]
    return typeof v === "string" && v.trim() ? v.trim() : fallback
  }

  const firestoreLegacyUid =
    typeof data.legacyUnscopedRoomsOwnerUid === "string" ? data.legacyUnscopedRoomsOwnerUid.trim() : ""
  const envLegacyUid =
    typeof process !== "undefined" && typeof process.env.NEXT_PUBLIC_LEGACY_UNSCOPED_ROOMS_OWNER_UID === "string"
      ? process.env.NEXT_PUBLIC_LEGACY_UNSCOPED_ROOMS_OWNER_UID.trim()
      : ""
  const legacyUnscopedRoomsOwnerUid = firestoreLegacyUid || envLegacyUid

  return {
    navTitle: str("navTitle", MARKETPLACE_DEFAULTS.navTitle),
    navSubtitle: str("navSubtitle", MARKETPLACE_DEFAULTS.navSubtitle),
    navLogoUrl: str("navLogoUrl", MARKETPLACE_DEFAULTS.navLogoUrl),
    siteTabTitle:
      typeof data.siteTabTitle === "string" ? data.siteTabTitle.trim() : MARKETPLACE_DEFAULTS.siteTabTitle,
    siteFaviconUrl:
      typeof data.siteFaviconUrl === "string" ? data.siteFaviconUrl.trim() : MARKETPLACE_DEFAULTS.siteFaviconUrl,
    heroEyebrow: str("heroEyebrow", MARKETPLACE_DEFAULTS.heroEyebrow),
    heroHeadline: str("heroHeadline", MARKETPLACE_DEFAULTS.heroHeadline),
    heroSubheadline: str("heroSubheadline", MARKETPLACE_DEFAULTS.heroSubheadline),
    searchPlaceholder: str("searchPlaceholder", MARKETPLACE_DEFAULTS.searchPlaceholder),
    featurePills: featurePills.length ? featurePills : MARKETPLACE_DEFAULTS.featurePills,
    partnerEyebrow: str("partnerEyebrow", MARKETPLACE_DEFAULTS.partnerEyebrow),
    partnerHeadline: str("partnerHeadline", MARKETPLACE_DEFAULTS.partnerHeadline),
    partnerBody: str("partnerBody", MARKETPLACE_DEFAULTS.partnerBody),
    showDemoResorts:
      typeof data.showDemoResorts === "boolean"
        ? data.showDemoResorts
        : MARKETPLACE_DEFAULTS.showDemoResorts,
    emptyListTitle: str("emptyListTitle", MARKETPLACE_DEFAULTS.emptyListTitle),
    emptyListSubtext: str("emptyListSubtext", MARKETPLACE_DEFAULTS.emptyListSubtext),
    legacyUnscopedRoomsOwnerUid,
  }
}

/** Public read: `settings/marketplace` (copy + layout for `/resorts`). */
export function useMarketplaceSettings() {
  const [settings, setSettings] = useState<MarketplaceSettings>(MARKETPLACE_DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!db) {
      setLoading(false)
      return
    }

    const ref = doc(db, "settings", MARKETPLACE_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setSettings(mergeMarketplaceFromFirestore(snap.data() as Record<string, unknown>))
        } else {
          setSettings(mergeMarketplaceFromFirestore({}))
        }
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub()
  }, [])

  return { settings, loading }
}
