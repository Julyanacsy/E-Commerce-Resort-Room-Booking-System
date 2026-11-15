"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LogOut,
  MapPin,
  Search,
  Star,
  Waves,
} from "lucide-react"
import { BRANDING_DEFAULTS } from "@/hooks/use-branding"
import { useMarketplaceSettings } from "@/hooks/use-marketplace-settings"
import { isPlaceholderOwnerUid } from "@/lib/booking-tenant"
import { getDestinationHighlightTitle } from "@/lib/resort-highlights.mjs"
import DynamicHead from "@/components/dynamic-head"
import { auth, db, googleProvider } from "@/lib/firebase"
import { getGoogleSignInErrorMessage, signInWithGoogle } from "@/lib/google-sign-in"
import { getRedirectResult, onAuthStateChanged, signOut } from "firebase/auth"
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore"
import { toast } from "sonner"
import { resortAdminRequest } from "@/lib/admin-api-client"
import { isRoomArchived } from "@/lib/room-archive.mjs"

const MOCK_RESORTS = [
  {
    id: "azure-cove",
    name: "Azure Cove Resort",
    location: "Batangas, PH",
    category: "Beachfront",
    rating: 4.7,
    reviews: 428,
    fromPrice: 3499,
    tags: ["Pool", "Ocean View", "Breakfast"],
    image:
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=80",
  },
  {
    id: "pine-crest",
    name: "Pine Crest Retreat",
    location: "Baguio, PH",
    category: "Mountain",
    rating: 4.6,
    reviews: 311,
    fromPrice: 2599,
    tags: ["Bonfire", "Hiking", "Pet-friendly"],
    image:
      "https://images.unsplash.com/photo-1470020337050-0b68b03f9e0b?auto=format&fit=crop&w=1400&q=80",
  },
  {
    id: "saffron-sands",
    name: "Saffron Sands Resort",
    location: "Cebu, PH",
    category: "Luxury",
    rating: 4.9,
    reviews: 892,
    fromPrice: 6499,
    tags: ["Spa", "Private Beach", "Fine Dining"],
    image:
      "https://images.unsplash.com/photo-1501117716987-c8e1ecb2101f?auto=format&fit=crop&w=1400&q=80",
  },
  {
    id: "sunset-harbor",
    name: "Sunset Harbor Resort",
    location: "Palawan, PH",
    category: "Beachfront",
    rating: 4.8,
    reviews: 512,
    fromPrice: 5299,
    tags: ["Island Tours", "Kayak", "Sunset Deck"],
    image:
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1400&q=80",
  },
  {
    id: "greenleaf-gardens",
    name: "Greenleaf Gardens",
    location: "Tagaytay, PH",
    category: "Family",
    rating: 4.5,
    reviews: 205,
    fromPrice: 1999,
    tags: ["Kids Zone", "Garden", "Café"],
    image:
      "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1400&q=80",
  },
  {
    id: "city-escape",
    name: "City Escape Staycation",
    location: "Metro Manila, PH",
    category: "Budget",
    rating: 4.3,
    reviews: 177,
    fromPrice: 1299,
    tags: ["Near Malls", "Fast WiFi", "Parking"],
    image:
      "https://images.unsplash.com/photo-1551887373-6f9a3c91d7b5?auto=format&fit=crop&w=1400&q=80",
  },
]

function formatPeso(value) {
  const number = Number(value || 0)
  return `₱${number.toLocaleString()}`
}

function FeaturedRoomsCarousel({ resort, imageFallback }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const rooms = resort.rooms
  const activeRoom = rooms[activeIndex]

  useEffect(() => {
    setActiveIndex(0)
    if (rooms.length < 2) return undefined

    const timer = setInterval(() => {
      setActiveIndex((index) => (index + 1) % rooms.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [rooms.length, resort.ownerUid])

  if (!activeRoom) return null

  return (
    <article className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-md shadow-emerald-950/5">
      <header className="flex items-center justify-between gap-3 border-b border-emerald-50 px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-emerald-950">{resort.name}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{resort.location}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          {rooms.length} featured room{rooms.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className="relative h-52 overflow-hidden bg-emerald-50 sm:h-60">
        <Link
          href={`/?o=${encodeURIComponent(resort.ownerUid)}#booking`}
          scroll
          className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
          aria-label={`Book ${activeRoom.name} at ${resort.name}`}
        >
          <img
            src={activeRoom.image || imageFallback}
            alt={activeRoom.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <div className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/95 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase text-emerald-900 shadow-sm backdrop-blur">
            Featured room
          </div>
        </Link>
        {rooms.length > 1 ? (
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveIndex((index) => (index - 1 + rooms.length) % rooms.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-emerald-950/55 text-white backdrop-blur transition hover:bg-emerald-950"
              aria-label={`Previous featured room at ${resort.name}`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setActiveIndex((index) => (index + 1) % rooms.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-emerald-950/55 text-white backdrop-blur transition hover:bg-emerald-950"
              aria-label={`Next featured room at ${resort.name}`}
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <Link href={`/?o=${encodeURIComponent(resort.ownerUid)}#booking`} scroll className="group block">
        <div className="p-5">
          <h4 className="line-clamp-1 text-lg font-bold text-emerald-900">{activeRoom.name}</h4>
          {activeRoom.description ? (
            <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-relaxed text-muted-foreground">
              {activeRoom.description}
            </p>
          ) : <div className="mt-2 min-h-10" />}
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-emerald-50 pt-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] uppercase text-emerald-700">
                {activeRoom.maxGuests ? `Up to ${activeRoom.maxGuests} guests` : resort.name}
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-950">
                {activeRoom.price > 0 ? (
                  <>
                    {formatPeso(activeRoom.price)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">/night</span>
                  </>
                ) : <span className="text-lg">Check availability</span>}
              </p>
            </div>
            <span className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase text-white transition group-hover:bg-emerald-600">
              Book
            </span>
          </div>
        </div>
      </Link>

      {rooms.length > 1 ? (
        <div className="flex justify-center gap-1.5 px-4 pb-4" aria-label={`Featured room ${activeIndex + 1} of ${rooms.length}`}>
          {rooms.map((room, index) => (
            <button
              key={room.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-2 rounded-full transition-all ${index === activeIndex ? "w-6 bg-emerald-700" : "w-2 bg-emerald-200 hover:bg-emerald-400"}`}
              aria-label={`Show ${room.name}`}
              aria-current={index === activeIndex ? "true" : undefined}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
}

function isGenericMarketplaceTitle(name) {
  const n = String(name || "").trim().toLowerCase()
  if (!n || n === "resort") return true
  if (n === String(BRANDING_DEFAULTS.name || "").trim().toLowerCase()) return true
  return false
}

function formatStatusLabel(value) {
  const raw = String(value || "").trim()
  if (!raw) return "—"
  const normalized = raw.toLowerCase()
  if (normalized === "no_record" || normalized === "no record") return "No record"
  if (normalized === "pending") return "Pending"
  if (normalized === "approved") return "Approved"
  if (normalized === "rejected") return "Rejected"
  return raw.replaceAll("_", " ")
}

const DEFAULT_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1400&q=80"

function resortSortMs(r) {
  const u = r.updatedAt?.toMillis?.()
  const a = r.approvedAt?.toMillis?.()
  const c = r.createdAt?.toMillis?.()
  return Math.max(u ?? 0, a ?? 0, c ?? 0)
}

/** Marketplace row from `resorts/*` — approved, or grandfathered (no / unknown status; not pending/rejected). */
function isPublicMarketplaceResortDoc(r) {
  const s = String(r.status || "").trim().toLowerCase()
  const published = r?.published
  if (s === "pending" || s === "rejected" || s === "archived") return false
  // New workflow: approved resorts must be explicitly published by the resort owner.
  if (s === "approved") return published === true
  // If explicitly unpublished, never list.
  if (published === false) return false
  // Legacy docs created before the approval workflow still list here.
  return true
}

export default function ResortsMarketplacePage() {
  const { settings: mp } = useMarketplaceSettings()
  const marketplaceHeadBranding = useMemo(() => {
    const logo = String(mp.navLogoUrl || "").trim() || "/icon.svg"
    const favicon =
      String(mp.siteFaviconUrl || "").trim() || logo
    const explicitTab = String(mp.siteTabTitle || "").trim()
    const tabTitle = explicitTab
      ? explicitTab
      : String(mp.navSubtitle || "").trim()
        ? `${mp.navTitle} — ${mp.navSubtitle}`
        : mp.navTitle
    return {
      ...BRANDING_DEFAULTS,
      name: mp.navTitle,
      tabTitle,
      logo,
      favicon,
    }
  }, [mp.navTitle, mp.navSubtitle, mp.navLogoUrl, mp.siteTabTitle, mp.siteFaviconUrl])
  const navLogoSrc = marketplaceHeadBranding.logo
  const hasCustomNavLogo = Boolean(String(mp.navLogoUrl || "").trim())
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const [activeHeroIndex, setActiveHeroIndex] = useState(0)
  const [showAllResorts, setShowAllResorts] = useState(false)
  const [joinUser, setJoinUser] = useState(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const redirectResultHandled = useRef(false)
  const [ownerStatus, setOwnerStatus] = useState("no_record")
  const [ownerDocLoading, setOwnerDocLoading] = useState(false)
  const [resortDocLoading, setResortDocLoading] = useState(false)
  const [resortStatus, setResortStatus] = useState("no_record")
  const [ownerRejectionReason, setOwnerRejectionReason] = useState("")
  const [resortRejectionReason, setResortRejectionReason] = useState("")
  const [resortForm, setResortForm] = useState(() => ({
    name: "",
    location: "",
    mapsUrl: "",
    description: "",
  }))
  const [resortSubmitting, setResortSubmitting] = useState(false)
  /** Short-lived message after resort form save (first submit or update). */
  const [resortSubmitSuccess, setResortSubmitSuccess] = useState(null)
  /** Resorts from `resorts/*` shown on the marketplace (approved + grandfathered). */
  const [liveResorts, setLiveResorts] = useState([])
  /** Doc ids in `resorts` (usually same as ownerUid) — used to detect room-only legacy hosts. */
  const [resortDocIds, setResortDocIds] = useState(() => new Set())
  /** Resort doc ids that are pending/rejected (still show room-only card if legacy UID matches). */
  const [resortMarketplaceBlockedIds, setResortMarketplaceBlockedIds] = useState(() => new Set())
  /** Owners with bookable rooms but no `resorts/{uid}` doc (pre–marketplace-registration accounts). */
  const [roomOnlyResorts, setRoomOnlyResorts] = useState([])
  /** Per owner: cheapest nightly from their rooms + first room image (live overlay). */
  const [ownerListingHints, setOwnerListingHints] = useState({})
  const [ownerDestinationHighlights, setOwnerDestinationHighlights] = useState({})
  const [resortsFromDbReady, setResortsFromDbReady] = useState(false)

  useEffect(() => {
    if (!resortSubmitSuccess) return
    const t = setTimeout(() => setResortSubmitSuccess(null), 5500)
    return () => clearTimeout(t)
  }, [resortSubmitSuccess])

  useEffect(() => {
    if (!db) return
    const unsub = onSnapshot(
      collection(db, "resorts"),
      (snap) => {
        const ids = new Set(snap.docs.map((d) => d.id))
        const blocked = new Set()
        snap.docs.forEach((d) => {
          const st = String(d.data()?.status || "").trim().toLowerCase()
          if (st === "pending" || st === "rejected" || st === "archived") blocked.add(d.id)
        })
        setResortDocIds(ids)
        setResortMarketplaceBlockedIds(blocked)
        const listed = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isPublicMarketplaceResortDoc)
          .sort((a, b) => resortSortMs(b) - resortSortMs(a))

        const rows = listed
          .map((r) => {
            const tags = Array.isArray(r.tags)
              ? r.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()).slice(0, 6)
              : ["Verified listing", "Book online"]
            const listingImage = typeof r.listingImage === "string" ? r.listingImage.trim() : ""
            const ratingNum = Number(r.rating)
            const rating = Number.isFinite(ratingNum) && ratingNum > 0 ? Math.min(5, ratingNum) : 4.8
            const reviews = Number(r.reviewCount)
            const description =
              typeof r.description === "string" && r.description.trim() ? r.description.trim() : ""
            const ownerUid = isPlaceholderOwnerUid(r.ownerUid) ? r.id : r.ownerUid || r.id
            return {
              id: r.id,
              ownerUid,
              name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Resort",
              location: typeof r.location === "string" && r.location.trim() ? r.location.trim() : "Philippines",
              category:
                typeof r.category === "string" && r.category.trim() ? r.category.trim() : "Resort",
              rating,
              reviews: Number.isFinite(reviews) && reviews >= 0 ? reviews : 0,
              fromPrice: Number(r.fromPrice) > 0 ? Number(r.fromPrice) : 0,
              tags,
              listingImage,
              image: listingImage || DEFAULT_LISTING_IMAGE,
              description,
            }
          })
          .filter((resort) => !isPlaceholderOwnerUid(resort.ownerUid))
        setLiveResorts(rows)
        setResortsFromDbReady(true)
      },
      () => {
        setResortsFromDbReady(true)
      },
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!db || !liveResorts.length) {
      setOwnerDestinationHighlights({})
      return undefined
    }

    const subscriptions = liveResorts
      .map((resort) => String(resort.ownerUid || resort.id || "").trim())
      .filter((ownerUid) => ownerUid && !isPlaceholderOwnerUid(ownerUid))
      .map((ownerUid) =>
        onSnapshot(
          doc(db, "resortOwners", ownerUid, "site", "branding"),
          (snapshot) => {
            const highlights = snapshot.exists() && Array.isArray(snapshot.data()?.destinationHighlights)
              ? snapshot.data().destinationHighlights.filter(
                  (item) =>
                    item
                    && typeof item.title === "string"
                    && typeof item.image === "string"
                    && /^data:image\/(?:jpeg|png|webp);base64,/.test(item.image),
                )
              : []
            setOwnerDestinationHighlights((previous) => ({ ...previous, [ownerUid]: highlights }))
          },
          (error) => {
            console.error(`Failed to load destination highlights for resort ${ownerUid}:`, error)
          },
        ),
      )

    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [liveResorts])

  useEffect(() => {
    if (!db) return
    const configuredLegacyUid = String(mp.legacyUnscopedRoomsOwnerUid || "").trim()
    const legacyUid = isPlaceholderOwnerUid(configuredLegacyUid) ? "" : configuredLegacyUid
    return onSnapshot(collection(db, "rooms"), (snap) => {
      const map = {}
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data()
        if (isRoomArchived(d)) return
        let ou =
          typeof d.ownerUid === "string" && d.ownerUid.trim() ? d.ownerUid.trim() : ""
        if (!ou && legacyUid) ou = legacyUid
        if (!ou || typeof ou !== "string" || isPlaceholderOwnerUid(ou)) return
        const price = Number(d.price) || 0
        const disc = Number(d.discount) || 0
        const nightly = disc > 0 && disc < 100 ? price * (1 - disc / 100) : price
        const imgs = d.images
        const img = Array.isArray(imgs) && typeof imgs[0] === "string" ? imgs[0] : null
        const prev = map[ou] || {
          minPrice: Infinity,
          image: null,
          roomNames: [],
          roomCount: 0,
          featuredRooms: [],
        }
        const nextMin = nightly > 0 ? Math.min(prev.minPrice, nightly) : prev.minPrice
        const rn = typeof d.name === "string" && d.name.trim() ? d.name.trim() : ""
        const nextNames =
          rn && !prev.roomNames.includes(rn) && prev.roomNames.length < 12
            ? [...prev.roomNames, rn]
            : prev.roomNames
        map[ou] = {
          minPrice: nextMin,
          image: prev.image || img,
          roomNames: nextNames,
          roomCount: prev.roomCount + 1,
          featuredRooms:
            d.featured === true
              ? [
                  ...prev.featuredRooms,
                  {
                    id: docSnap.id,
                    name: rn || "Featured room",
                    image: img,
                    description: typeof d.description === "string" ? d.description.trim() : "",
                    price: nightly,
                    maxGuests: Number(d.maxGuests) || 0,
                  },
                ]
              : prev.featuredRooms,
        }
      })
      Object.keys(map).forEach((k) => {
        if (!Number.isFinite(map[k].minPrice) || map[k].minPrice === Infinity) {
          map[k].minPrice = 0
        }
      })
      setOwnerListingHints(map)
    })
  }, [mp.legacyUnscopedRoomsOwnerUid])

  const roomOnlyUidsKey = useMemo(() => {
    const legacy = String(mp.legacyUnscopedRoomsOwnerUid || "").trim()
    return Object.keys(ownerListingHints)
      .filter((uid) => {
        if (typeof uid !== "string" || !uid.trim() || isPlaceholderOwnerUid(uid)) return false
        const hasDoc = resortDocIds.has(uid)
        const blocked = resortMarketplaceBlockedIds.has(uid)
        if (!hasDoc) return true
        if (blocked && legacy && uid === legacy) return true
        return false
      })
      .sort()
      .join("|")
  }, [ownerListingHints, resortDocIds, resortMarketplaceBlockedIds, mp.legacyUnscopedRoomsOwnerUid])

  useEffect(() => {
    if (!db) {
      setRoomOnlyResorts([])
      return
    }
    if (!roomOnlyUidsKey) {
      setRoomOnlyResorts([])
      return
    }
    const uids = roomOnlyUidsKey.split("|").filter(Boolean)
    let cancelled = false
    ;(async () => {
      const rows = await Promise.all(
        uids.map(async (ownerUid) => {
          let name = "Resort"
          let location = "Philippines"
          let description = ""
          try {
            const rs = await getDoc(doc(db, "resorts", ownerUid))
            if (rs.exists()) {
              const rd = rs.data() || {}
              if (typeof rd.name === "string" && rd.name.trim()) name = rd.name.trim()
              if (typeof rd.location === "string" && rd.location.trim()) location = rd.location.trim()
              if (typeof rd.description === "string" && rd.description.trim()) {
                description = rd.description.trim()
              }
            }
          } catch {
            /* ignore */
          }
          try {
            const snap = await getDoc(doc(db, "resortOwners", ownerUid, "site", "branding"))
            if (snap.exists()) {
              const data = snap.data() || {}
              const n = data.name
              const addr = data.address
              if (typeof n === "string" && n.trim() && isGenericMarketplaceTitle(name)) name = n.trim()
              if (typeof addr === "string" && addr.trim() && location === "Philippines") {
                location = addr.trim()
              }
            }
          } catch {
            /* ignore */
          }
          return {
            id: ownerUid,
            ownerUid,
            name,
            location,
            category: "Resort",
            rating: 4.8,
            reviews: 0,
            fromPrice: 0,
            tags: ["Book online"],
            image: DEFAULT_LISTING_IMAGE,
            description,
          }
        }),
      )
      if (!cancelled) setRoomOnlyResorts(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [roomOnlyUidsKey])

  const liveWithHints = useMemo(() => {
    const merged = [...liveResorts, ...roomOnlyResorts]
    return merged.map((r) => {
      const key = r.ownerUid || r.id
      const hint = ownerListingHints[key]
      const minFromRooms = hint?.minPrice && hint.minPrice > 0 ? hint.minPrice : null
      const fromPrice = minFromRooms ?? (r.fromPrice > 0 ? r.fromPrice : 0)
      const image = hint?.image || r.image
      const heroImage = r.listingImage || null
      const roomNames = Array.isArray(hint?.roomNames) ? hint.roomNames : []
      const roomSearchText = roomNames.join(" ").toLowerCase()
      let name = r.name
      if (isGenericMarketplaceTitle(name) && roomNames.length) {
        name =
          roomNames.length <= 2
            ? roomNames.join(" · ")
            : `${roomNames[0]} · +${roomNames.length - 1} room types`
      }
      const rc = hint?.roomCount ?? 0
      const listingSubtitle =
        rc > 1
          ? `${rc} room types on this resort’s booking page`
          : rc === 1
            ? "Full resort booking & checkout on View"
            : ""
      const tagsBase = Array.isArray(r.tags) ? [...r.tags] : []
      if (rc > 0 && !tagsBase.some((t) => /room/i.test(t))) {
        tagsBase.push(rc === 1 ? "1 room type" : `${rc} room types`)
      }
      const tags = tagsBase.filter(Boolean).slice(0, 6)
      return {
        ...r,
        name,
        fromPrice,
        image,
        heroImage,
        roomSearchText,
        listingSubtitle,
        tags,
      }
    })
  }, [liveResorts, roomOnlyResorts, ownerListingHints])

  const heroSlides = useMemo(
    () =>
      liveWithHints
        .flatMap((resort) => {
          const highlights = ownerDestinationHighlights[resort.ownerUid] || []
          if (highlights.length) {
            return highlights.map((highlight, index) => ({
              ...resort,
              id: `${resort.id}-destination-${index}`,
              resortName: resort.name,
              name: highlight.title,
              description: highlight.description || "",
              heroImage: highlight.image,
            }))
          }
          return resort.heroImage ? [resort] : []
        })
        .slice(0, 12),
    [liveWithHints, ownerDestinationHighlights],
  )

  useEffect(() => {
    setActiveHeroIndex((index) => (heroSlides.length ? index % heroSlides.length : 0))
    if (heroSlides.length < 2) return
    const timer = setInterval(() => {
      setActiveHeroIndex((index) => (index + 1) % heroSlides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [heroSlides.length])

  const combinedListings = useMemo(() => {
    const demos = mp.showDemoResorts ? MOCK_RESORTS.map((m) => ({ ...m, ownerUid: null })) : []
    return [...liveWithHints, ...demos]
  }, [liveWithHints, mp.showDemoResorts])

  const categoryOptions = useMemo(() => {
    const s = new Set(["All"])
    combinedListings.forEach((r) => {
      if (r.category && String(r.category).trim()) {
        s.add(String(r.category).trim())
      }
    })
    return Array.from(s).sort((a, b) => {
      if (a === "All") return -1
      if (b === "All") return 1
      return a.localeCompare(b)
    })
  }, [combinedListings])

  useEffect(() => {
    if (!categoryOptions.includes(category)) {
      setCategory("All")
    }
  }, [categoryOptions, category])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return combinedListings.filter((resort) => {
      const matchesCategory = category === "All" || resort.category === category
      if (!matchesCategory) return false
      if (!q) return true
      const desc = (resort.description || "").toLowerCase()
      const roomsBlob = String(resort.roomSearchText || "").toLowerCase()
      const sub = String(resort.listingSubtitle || "").toLowerCase()
      return (
        resort.name.toLowerCase().includes(q) ||
        resort.location.toLowerCase().includes(q) ||
        (desc && desc.includes(q)) ||
        (roomsBlob && roomsBlob.includes(q)) ||
        (sub && sub.includes(q)) ||
        resort.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [query, category, combinedListings])

  const featuredRoomListings = useMemo(() => {
    const visibleOwners = new Set(
      filtered.map((resort) => resort.ownerUid).filter((ownerUid) => typeof ownerUid === "string"),
    )
    return liveWithHints.flatMap((resort) => {
      const ownerUid = resort.ownerUid || resort.id
      if (!visibleOwners.has(ownerUid)) return []
      const hint = ownerListingHints[ownerUid]
      return (hint?.featuredRooms || []).map((room) => ({
        ...room,
        ownerUid,
        resortName: resort.name,
        location: resort.location,
      }))
    })
  }, [filtered, liveWithHints, ownerListingHints])

  const featuredRoomGroups = useMemo(() => {
    const groups = new Map()
    featuredRoomListings.forEach((room) => {
      const current = groups.get(room.ownerUid) || {
        ownerUid: room.ownerUid,
        name: room.resortName,
        location: room.location,
        rooms: [],
      }
      current.rooms.push(room)
      groups.set(room.ownerUid, current)
    })
    return Array.from(groups.values())
  }, [featuredRoomListings])

  useEffect(() => {
    if (showAllResorts) {
      document.getElementById("all-resorts")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [showAllResorts])

  useEffect(() => {
    if (!auth) return
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setJoinUser(user)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!auth || redirectResultHandled.current) return
    redirectResultHandled.current = true
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result?.user) return
        const requestResult = await resortAdminRequest("/api/resort/registration", { action: "owner.request" })
        setOwnerStatus(requestResult.alreadyApproved ? "approved" : "pending")
        toast.success(requestResult.alreadyApproved
          ? "Your resort account is already approved."
          : "Thanks! Your resort account request is submitted for approval.")
      })
      .catch((error) => {
        console.error("Google sign-in redirect failed:", error)
        toast.error(getGoogleSignInErrorMessage(error))
      })
  }, [])

  useEffect(() => {
    if (!joinUser?.uid) {
      setOwnerStatus("no_record")
      setResortStatus("no_record")
      return
    }

    setOwnerDocLoading(true)
    setResortDocLoading(true)

    const unsubOwner = onSnapshot(
      doc(db, "resortOwners", joinUser.uid),
      (snap) => {
        if (!snap.exists()) {
          setOwnerStatus("no_record")
          setOwnerRejectionReason("")
        } else {
          const data = snap.data() || {}
          setOwnerStatus(String(data.status || "pending"))
          setOwnerRejectionReason(String(data.rejectionReason || ""))
        }
        setOwnerDocLoading(false)
      },
      () => {
        setOwnerDocLoading(false)
      },
    )

    const unsubResort = onSnapshot(
      doc(db, "resorts", joinUser.uid),
      (snap) => {
        if (!snap.exists()) {
          setResortStatus("no_record")
          setResortRejectionReason("")
        } else {
          const data = snap.data() || {}
          setResortForm((prev) => ({
            ...prev,
            name: typeof data.name === "string" ? data.name : prev.name,
            location: typeof data.location === "string" ? data.location : prev.location,
            mapsUrl: typeof data.mapsUrl === "string" ? data.mapsUrl : prev.mapsUrl,
            description: typeof data.description === "string" ? data.description : prev.description,
          }))
          setResortStatus(String(data.status || "pending"))
          setResortRejectionReason(String(data.rejectionReason || ""))
        }
        setResortDocLoading(false)
      },
      () => {
        setResortDocLoading(false)
      },
    )

    return () => {
      unsubOwner()
      unsubResort()
    }
  }, [joinUser?.uid])

  const handleJoinWithGoogle = async () => {
    if (!auth || !googleProvider) {
      toast.error("Google sign-in is not available right now.")
      return
    }

    setJoinSubmitting(true)
    try {
      const { result, redirected } = await signInWithGoogle(auth, googleProvider)
      if (redirected) {
        toast.info("Your browser blocked the sign-in popup. Continuing with Google sign-in…")
        return
      }
      const user = result?.user
      if (!user) throw new Error("Google did not return a signed-in account.")

      const requestResult = await resortAdminRequest("/api/resort/registration", { action: "owner.request" })
      setOwnerStatus(requestResult.alreadyApproved ? "approved" : "pending")
      toast.success(requestResult.alreadyApproved
        ? "Your resort account is already approved."
        : "Thanks! Your resort account request is submitted for approval.")
    } catch (error) {
      console.error("Join with Google failed", error)
      toast.error(getGoogleSignInErrorMessage(error))
    } finally {
      setJoinSubmitting(false)
    }
  }

  const handleResortSubmit = async (e) => {
    e.preventDefault()
    if (!joinUser?.uid) return

    const name = resortForm.name.trim()
    const location = resortForm.location.trim()
    const mapsUrl = resortForm.mapsUrl.trim()
    const description = resortForm.description.trim()

    if (!name || !location || !mapsUrl) {
      toast.error("Please fill in resort name, location, and Google Maps link.")
      return
    }

    const looksLikeMaps =
      mapsUrl.includes("google.com/maps") ||
      mapsUrl.includes("maps.app.goo.gl") ||
      mapsUrl.includes("goo.gl/maps")
    if (!looksLikeMaps) {
      toast.error("Please paste a valid Google Maps link (pin location).")
      return
    }

    setResortSubmitting(true)
    try {
      const isFirstSubmit = resortStatus === "no_record"
      await resortAdminRequest("/api/resort/registration", {
        action: "registration.submit",
        registration: { name, location, mapsUrl, description },
      })

      setResortStatus("pending")
      const wasRejected = resortStatus === "rejected"
      setResortSubmitSuccess(
        isFirstSubmit
          ? "Submit successful — your resort is queued for admin review."
          : wasRejected
            ? "Submit successful — your resort was sent back for admin review."
            : "Changes saved — your updated details are pending review.",
      )
      toast.success(
        isFirstSubmit
          ? "Resort registration submitted. Waiting for admin approval."
          : wasRejected
            ? "Resort registration resubmitted. Waiting for admin approval."
            : "Your registration was updated. It’s still pending admin review.",
      )
    } catch (error) {
      console.error("Resort registration failed", error)
      toast.error("Failed to submit resort registration. Please try again.")
    } finally {
      setResortSubmitting(false)
    }
  }

  const handleJoinLogout = async () => {
    if (!auth) return
    try {
      await signOut(auth)
      setOwnerStatus("no_record")
      setResortStatus("no_record")
      setOwnerRejectionReason("")
      setResortRejectionReason("")
      setResortForm({ name: "", location: "", mapsUrl: "", description: "" })
      setResortSubmitSuccess(null)
      toast.success("Signed out.")
    } catch (error) {
      console.error("Sign out failed", error)
      toast.error("Failed to sign out.")
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-emerald-50/70 via-white to-emerald-50/30">
      <DynamicHead brandingOverride={marketplaceHeadBranding} />
      <header className="sticky top-0 z-30 border-b border-emerald-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:py-2.5">
          <Link href="/resorts" className="flex items-center gap-3">
            {hasCustomNavLogo ? (
              <>
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-100 bg-white shadow-sm">
                  <img
                    src={navLogoSrc}
                    alt="Marketplace"
                    className="h-8 w-8 object-contain"
                  />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold tracking-[0.25em] uppercase text-emerald-800">
                    {mp.navTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mp.navSubtitle}
                  </p>
                </div>
              </>
            ) : (
              <img
                src="/images/bayrest-logo.png"
                alt="BayRest Resort Marketplace"
                className="h-auto w-48 shrink-0 object-contain sm:w-52"
              />
            )}
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/admin"
              className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold tracking-[0.2em] uppercase text-white shadow-lg shadow-emerald-700/20 transition hover:-translate-y-0.5 hover:bg-emerald-600"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="relative isolate mb-7 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 shadow-xl shadow-emerald-950/15 sm:rounded-[2rem]">
          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/4 h-64 w-64 rounded-full bg-teal-300/15 blur-3xl" />
          <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-10 lg:p-10">
            <div className="py-2 sm:py-4">
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-100/10 px-3 py-1.5 text-[11px] font-semibold tracking-[0.2em] uppercase text-emerald-100">
                <Waves className="h-4 w-4" aria-hidden />
                {mp.heroEyebrow}
              </p>
              <h1 className="mt-5 max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                {mp.heroHeadline}
              </h1>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href="#resort-search"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-950/20 transition hover:-translate-y-0.5 hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950"
                >
                  <Search className="h-4 w-4" aria-hidden />
                  Search resorts
                </a>
                <span className="text-xs font-medium text-white/65 sm:text-sm">
                  Discover <span className="px-1 text-emerald-300">·</span> Book{" "}
                  <span className="px-1 text-emerald-300">·</span> Relax
                </span>
              </div>
            </div>

            <div className="group relative min-h-56 overflow-hidden rounded-2xl border border-white/15 bg-emerald-950 sm:min-h-64 lg:min-h-72" aria-roledescription="carousel" aria-label="Featured resort highlights">
              {heroSlides[activeHeroIndex] ? (
                <img
                  key={heroSlides[activeHeroIndex].id}
                  src={heroSlides[activeHeroIndex].heroImage}
                  alt={getDestinationHighlightTitle(
                    heroSlides[activeHeroIndex].name,
                    heroSlides[activeHeroIndex].resortName || "Resort destination",
                  )}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950">
                  <Waves className="h-16 w-16 text-emerald-100/20" aria-hidden />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/90 via-emerald-950/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.18em] uppercase text-emerald-200">
                    {heroSlides[activeHeroIndex] ? "Resort highlight" : "Your next escape"}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white sm:text-xl">
                    {getDestinationHighlightTitle(
                      heroSlides[activeHeroIndex]?.name,
                      heroSlides[activeHeroIndex]?.resortName || "Find a place to unwind",
                    )}
                  </p>
                  {heroSlides[activeHeroIndex] ? (
                    <>
                      {heroSlides[activeHeroIndex].resortName && heroSlides[activeHeroIndex].resortName !== heroSlides[activeHeroIndex].name ? (
                        <p className="mt-1 text-sm font-medium text-emerald-100/85">
                          {heroSlides[activeHeroIndex].resortName}
                        </p>
                      ) : null}
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-50/90">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{heroSlides[activeHeroIndex].location}</span>
                      </p>
                      <p className="mt-2 line-clamp-2 max-w-xl text-xs leading-5 text-white/75 sm:text-sm">
                        {heroSlides[activeHeroIndex].description || heroSlides[activeHeroIndex].tags.slice(0, 3).join(" · ")}
                      </p>
                      <Link
                        href={`/?o=${encodeURIComponent(heroSlides[activeHeroIndex].ownerUid || heroSlides[activeHeroIndex].id)}#booking`}
                        className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-300 px-4 py-2 text-xs font-bold tracking-wide text-emerald-950 shadow-lg shadow-emerald-950/20 transition hover:-translate-y-0.5 hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950"
                      >
                        Book now
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-emerald-50/75">Resort photos and destination highlights will appear here.</p>
                  )}
                </div>
                {heroSlides.length > 1 ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveHeroIndex((index) => (index - 1 + heroSlides.length) % heroSlides.length)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-emerald-950/35 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
                      aria-label="Previous resort highlight"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveHeroIndex((index) => (index + 1) % heroSlides.length)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-emerald-950/35 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
                      aria-label="Next resort highlight"
                    >
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>
              {heroSlides.length > 1 ? (
                <div className="absolute right-5 top-5 flex items-center gap-1.5 sm:right-6 sm:top-6" aria-label="Choose resort highlight">
                  {heroSlides.map((slide, index) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setActiveHeroIndex(index)}
                      className={`h-2 rounded-full transition-all ${
                        index === activeHeroIndex ? "w-7 bg-emerald-200" : "w-2 bg-white/65 hover:bg-white"
                      }`}
                      aria-label={`Show ${slide.name}`}
                      aria-current={index === activeHeroIndex ? "true" : undefined}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section
          id="resort-search"
          className="relative z-10 mb-10 grid gap-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-lg shadow-emerald-950/5 sm:p-5 md:grid-cols-3 md:items-center"
          aria-label="Resort search and filters"
        >
          <div className="md:col-span-2 md:max-w-xl">
            <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
              Search resorts & room types
            </label>
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700/70"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mp.searchPlaceholder}
                autoComplete="off"
                className="h-10 w-full rounded-xl border border-emerald-100 bg-background pl-10 pr-4 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Matches resort name, location, description, tags, and individual room names.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-12 w-full rounded-xl border border-emerald-100 bg-background px-4 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section id="featured-rooms" className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-emerald-700">
              Find your stay
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-emerald-950 sm:text-3xl">
              Explore resorts
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Showing <span className="font-semibold text-emerald-900">{featuredRoomListings.length}</span>{" "}
              featured room{featuredRoomListings.length === 1 ? "" : "s"} from{" "}
              <span className="font-semibold text-emerald-900">{featuredRoomGroups.length}</span>{" "}
              resort{featuredRoomGroups.length === 1 ? "" : "s"}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllResorts(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full border border-emerald-200 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:self-auto"
          >
            View all resorts
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:gap-6" aria-label="Featured rooms by resort">
          {!resortsFromDbReady ? (
            <div className="col-span-full rounded-2xl border border-emerald-100 bg-white px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
              Loading resorts from the database…
            </div>
          ) : featuredRoomListings.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-14 text-center">
              <p className="text-lg font-semibold text-emerald-900">
                {filtered.length ? "No featured rooms yet" : mp.emptyListTitle}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {filtered.length
                  ? "Resort owners’ featured rooms will appear here. View all resorts to browse every available listing."
                  : mp.emptyListSubtext}
              </p>
            </div>
          ) : null}
          {featuredRoomGroups.map((resort) => (
            <FeaturedRoomsCarousel
              key={resort.ownerUid}
              resort={resort}
              imageFallback={ownerListingHints[resort.ownerUid]?.image || "/deluxe-hotel-room.jpg"}
            />
          ))}
        </section>

        {showAllResorts ? (
          <section id="all-resorts" className="mt-14 scroll-mt-24">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] uppercase text-emerald-700">Browse every listing</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-emerald-950 sm:text-3xl">All resorts</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {filtered.length} resort{filtered.length === 1 ? "" : "s"} match your search and category.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllResorts(false)}
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                Show featured rooms
              </button>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {!resortsFromDbReady ? (
                <div className="col-span-full rounded-2xl border border-emerald-100 bg-white px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
                  Loading resorts from the database…
                </div>
              ) : filtered.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-14 text-center">
                  <p className="text-lg font-semibold text-emerald-900">{mp.emptyListTitle}</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{mp.emptyListSubtext}</p>
                </div>
              ) : null}
              {filtered.map((resort) => (
                <Link
                  key={resort.ownerUid ? `live-${resort.id}` : resort.id}
                  href={resort.ownerUid ? `/?o=${encodeURIComponent(resort.ownerUid)}` : "/resorts"}
                  scroll
                  className="group overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-md shadow-emerald-950/5 transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-950/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                >
                  <div className="relative h-52 overflow-hidden bg-emerald-50">
                    <img
                      src={resort.image}
                      alt={resort.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                    <div className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/95 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase text-emerald-900 shadow-sm backdrop-blur">
                      {resort.category}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-1 text-lg font-bold text-emerald-900">{resort.name}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin size={14} className="text-emerald-700/70" />
                          <span className="line-clamp-1">{resort.location}</span>
                        </p>
                        {resort.listingSubtitle ? (
                          <p className="mt-1.5 text-xs font-medium text-emerald-800/90">{resort.listingSubtitle}</p>
                        ) : null}
                        {resort.description ? (
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{resort.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        <Star size={14} className="text-emerald-600" />
                        {resort.rating.toFixed(1)}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {resort.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">From</p>
                        <p className="text-2xl font-bold text-emerald-900">
                          {resort.fromPrice > 0 ? (
                            <>
                              {formatPeso(resort.fromPrice)}
                              <span className="ml-1 text-sm font-normal text-muted-foreground">/night</span>
                            </>
                          ) : (
                            <span className="text-lg font-semibold text-muted-foreground">See listing</span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {resort.reviews > 0
                            ? `${resort.reviews.toLocaleString()} reviews`
                            : resort.ownerUid
                              ? "New on marketplace"
                              : "Demo listing"}
                        </p>
                      </div>
                      <span className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold tracking-[0.2em] uppercase text-white shadow-lg shadow-emerald-700/20 transition group-hover:bg-emerald-600">
                        View
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-12 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
          <div className="grid gap-0 md:grid-cols-5">
            <div className="md:col-span-3 p-6 md:p-8">
              <p className="text-xs font-semibold tracking-[0.35em] uppercase text-emerald-700/70">
                {mp.partnerEyebrow}
              </p>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold text-emerald-900">
                {mp.partnerHeadline}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground max-w-prose">
                {mp.partnerBody}
              </p>

              <div className="mt-6 grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:grid-cols-3">
                {[
                  { step: "01", title: "Join", desc: "Sign in with Google" },
                  { step: "02", title: "Register resort", desc: "Add name & location" },
                  { step: "03", title: "Get approved", desc: "Admin verifies and publishes" },
                ].map((s) => (
                  <div key={s.step} className="rounded-xl bg-white/70 p-4 border border-emerald-100/60">
                    <p className="text-[11px] font-semibold tracking-[0.35em] uppercase text-emerald-700/70">
                      Step {s.step}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-emerald-900">{s.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                ))}
              </div>

              {joinUser ? (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                    <img
                      src={joinUser.photoURL || "/icon.svg"}
                      alt="Signed in avatar"
                      className="h-10 w-10 shrink-0 rounded-full object-cover border border-emerald-100 bg-white"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 leading-tight">
                      <p className="text-sm font-semibold text-emerald-900 line-clamp-1">
                        {joinUser.displayName || "Resort Owner"}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1 break-all">
                        {joinUser.email || "Signed in"}
                      </p>
                      <p className="mt-1 text-[11px] text-emerald-800/80">
                        Private to your Google session — other visitors don&apos;t see this.
                      </p>
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px] sm:items-end sm:pt-0.5">
                    <button
                      type="button"
                      onClick={handleJoinLogout}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full border border-emerald-100 bg-white text-emerald-800 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
                      aria-label="Sign out"
                      title="Sign out"
                    >
                      <LogOut className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                      <span className="inline-flex max-w-full items-center rounded-full border border-emerald-100 bg-white px-3 py-1 text-xs font-semibold text-emerald-900">
                        <span className="truncate">
                          Owner:{" "}
                          <span className="text-emerald-700">
                            {ownerDocLoading ? "Checking…" : formatStatusLabel(ownerStatus)}
                          </span>
                        </span>
                      </span>
                      <span className="inline-flex max-w-full items-center rounded-full border border-emerald-100 bg-white px-3 py-1 text-xs font-semibold text-emerald-900">
                        <span className="truncate">
                          Resort:{" "}
                          <span className="text-emerald-700">
                            {resortDocLoading ? "Checking…" : formatStatusLabel(resortStatus)}
                          </span>
                        </span>
                      </span>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      Admin approval is required before your resort is published.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-6">
                  <button
                    onClick={handleJoinWithGoogle}
                    disabled={joinSubmitting}
                    className="inline-flex items-center justify-center gap-3 rounded-full bg-emerald-700 px-6 py-3 text-xs font-semibold tracking-[0.2em] uppercase text-white shadow-lg shadow-emerald-700/20 transition hover:-translate-y-0.5 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                    type="button"
                  >
                    {joinSubmitting ? "Connecting…" : "Join with Google"}
                  </button>
                </div>
              )}

              {joinUser && (
                <div className="mt-7 rounded-2xl border border-emerald-100 bg-white p-5">
                  {(resortStatus === "pending" || resortStatus === "approved") && (
                    <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-xs font-bold tracking-wide text-emerald-800 ring-1 ring-emerald-600/20">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                          On file
                        </span>
                        <span>Registration received</span>
                      </p>
                      <p className="mt-0.5 text-xs text-emerald-900/70">
                        Current status:{" "}
                        <span className="font-semibold text-emerald-900">
                          {resortDocLoading ? "Checking…" : formatStatusLabel(resortStatus)}
                        </span>
                        .
                      </p>
                      {resortStatus === "pending" && (
                        <p className="mt-2 text-xs text-emerald-900/70">
                          You can still edit your details below and save again while approval is pending.
                        </p>
                      )}
                    </div>
                  )}
                  {resortStatus === "rejected" && (
                    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      <p className="font-semibold">Registration rejected.</p>
                      <p className="mt-0.5 text-xs text-red-800/80">
                        Reason:{" "}
                        <span className="font-semibold">
                          {resortRejectionReason?.trim() ? resortRejectionReason : "No reason provided."}
                        </span>
                      </p>
                      <p className="mt-2 text-xs text-red-800/80">
                        Update your details below then resubmit for approval.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.3em] uppercase text-emerald-700/70">
                        Resort registration
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Fill this out so we can review and publish your resort.
                      </p>
                    </div>
                    <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                      Status:{" "}
                      {resortDocLoading ? "Checking…" : formatStatusLabel(resortStatus)}
                    </span>
                  </div>

                  <form onSubmit={handleResortSubmit} className="mt-5 grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
                          Resort name
                        </label>
                        <input
                          value={resortForm.name}
                          onChange={(e) =>
                            setResortForm((p) => ({ ...p, name: e.target.value }))
                          }
                          className="h-12 w-full rounded-xl border border-emerald-100 bg-background px-4 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
                          placeholder="e.g., Kamayan Penthouse Beach Resort"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
                          Location
                        </label>
                        <input
                          value={resortForm.location}
                          onChange={(e) =>
                            setResortForm((p) => ({
                              ...p,
                              location: e.target.value,
                            }))
                          }
                          className="h-12 w-full rounded-xl border border-emerald-100 bg-background px-4 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
                          placeholder="e.g., Laiya, Batangas"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
                        Google Maps link (exact pin) *
                      </label>
                      <input
                        value={resortForm.mapsUrl}
                        onChange={(e) =>
                          setResortForm((p) => ({
                            ...p,
                            mapsUrl: e.target.value,
                          }))
                        }
                        className="h-12 w-full rounded-xl border border-emerald-100 bg-background px-4 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
                        placeholder="Paste the Google Maps link here…"
                        inputMode="url"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        Tip: Open Google Maps → search your resort → Share → Copy link.
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
                        Description (optional)
                      </label>
                      <textarea
                        value={resortForm.description}
                        onChange={(e) =>
                          setResortForm((p) => ({
                            ...p,
                            description: e.target.value,
                          }))
                        }
                        rows={3}
                        className="w-full rounded-xl border border-emerald-100 bg-background px-4 py-3 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
                        placeholder="Short description of your resort…"
                      />
                    </div>

                    {resortSubmitSuccess && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="flex items-start gap-3 rounded-xl border-2 border-emerald-400/70 bg-emerald-50 px-4 py-3 shadow-sm ring-4 ring-emerald-200/40"
                      >
                        <CheckCircle2
                          className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                          aria-hidden
                        />
                        <div className="min-w-0 pt-0.5">
                          <p className="text-sm font-bold text-emerald-900">Submit successful</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-emerald-900/80">
                            {resortSubmitSuccess}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        disabled={
                          resortSubmitting ||
                          ownerStatus === "no_record" ||
                          resortStatus === "approved"
                        }
                        className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-6 py-3 text-xs font-semibold tracking-[0.2em] uppercase text-white shadow-lg shadow-emerald-700/20 transition hover:-translate-y-0.5 hover:bg-emerald-600 disabled:opacity-70 disabled:cursor-not-allowed"
                        type="submit"
                      >
                        {resortSubmitting
                          ? "Submitting…"
                          : resortStatus === "rejected"
                            ? "Resubmit for approval"
                            : resortStatus === "pending"
                              ? "Save changes"
                              : resortStatus === "approved"
                                ? "Submitted"
                                : "Submit for approval"}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        After approval, your resort will appear in the marketplace.
                      </p>
                    </div>
                  </form>
                </div>
              )}
            </div>

            <div className="md:col-span-2 bg-linear-to-br from-emerald-700 to-emerald-600 p-6 md:p-8 text-white">
              <p className="text-xs font-semibold tracking-[0.35em] uppercase text-white/80">
                What you get
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {[
                  "Owner dashboard (manage listings & bookings)",
                  "Admin approval workflow for trust & quality",
                  "Marketplace exposure to more guests",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-white/95">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-xl bg-white/10 p-4">
                <p className="text-xs font-semibold tracking-[0.3em] uppercase text-white/80">
                  Status
                </p>
                <p className="mt-2 text-sm text-white/95">
                  New accounts start as <span className="font-semibold">Pending</span>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {filtered.length === 0 && (
          <div className="mt-12 rounded-2xl border border-dashed border-emerald-200 bg-white p-10 text-center">
            <p className="text-sm font-semibold text-emerald-900">
              No resorts found.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different keyword or choose another category.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
