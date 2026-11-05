"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, LogOut, MapPin, Search, Star } from "lucide-react"
import { BRANDING_DEFAULTS } from "@/hooks/use-branding"
import { useMarketplaceSettings } from "@/hooks/use-marketplace-settings"
import DynamicHead from "@/components/dynamic-head"
import { auth, db, googleProvider } from "@/lib/firebase"
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth"
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import { toast } from "sonner"

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
  if (s === "pending" || s === "rejected") return false
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
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const [joinUser, setJoinUser] = useState(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)
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
          if (st === "pending" || st === "rejected") blocked.add(d.id)
        })
        setResortDocIds(ids)
        setResortMarketplaceBlockedIds(blocked)
        const listed = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isPublicMarketplaceResortDoc)
          .sort((a, b) => resortSortMs(b) - resortSortMs(a))

        const rows = listed.map((r) => {
          const tags = Array.isArray(r.tags)
            ? r.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()).slice(0, 6)
            : ["Verified listing", "Book online"]
          const listingImage =
            typeof r.listingImage === "string" && r.listingImage.trim() ? r.listingImage.trim() : DEFAULT_LISTING_IMAGE
          const ratingNum = Number(r.rating)
          const rating = Number.isFinite(ratingNum) && ratingNum > 0 ? Math.min(5, ratingNum) : 4.8
          const reviews = Number(r.reviewCount)
          const description =
            typeof r.description === "string" && r.description.trim() ? r.description.trim() : ""
          return {
            id: r.id,
            ownerUid: r.ownerUid || r.id,
            name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Resort",
            location: typeof r.location === "string" && r.location.trim() ? r.location.trim() : "Philippines",
            category:
              typeof r.category === "string" && r.category.trim() ? r.category.trim() : "Resort",
            rating,
            reviews: Number.isFinite(reviews) && reviews >= 0 ? reviews : 0,
            fromPrice: Number(r.fromPrice) > 0 ? Number(r.fromPrice) : 0,
            tags,
            image: listingImage,
            description,
          }
        })
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
    if (!db) return
    const legacyUid = String(mp.legacyUnscopedRoomsOwnerUid || "").trim()
    return onSnapshot(collection(db, "rooms"), (snap) => {
      const map = {}
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data()
        let ou =
          typeof d.ownerUid === "string" && d.ownerUid.trim() ? d.ownerUid.trim() : ""
        if (!ou && legacyUid) ou = legacyUid
        if (!ou || typeof ou !== "string") return
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
        if (typeof uid !== "string" || !uid.trim()) return false
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
        roomSearchText,
        listingSubtitle,
        tags,
      }
    })
  }, [liveResorts, roomOnlyResorts, ownerListingHints])

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

  useEffect(() => {
    if (!auth) return
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setJoinUser(user)
    })
    return () => unsubscribe()
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
      const result = await signInWithPopup(auth, googleProvider)
      const user = result.user

      await setDoc(
        doc(db, "resortOwners", user.uid),
        {
          uid: user.uid,
          email: user.email ?? "",
          displayName: user.displayName ?? "",
          photoURL: user.photoURL ?? "",
          role: "owner",
          status: "pending",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      )

      setOwnerStatus("pending")
      toast.success("Thanks! Your resort account request is submitted for approval.")
    } catch (error) {
      console.error("Join with Google failed", error)
      toast.error("Google sign-in failed. Please try again.")
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
      // One resort per owner for now (easy to expand later).
      const payload = {
        id: joinUser.uid,
        ownerUid: joinUser.uid,
        ownerEmail: joinUser.email ?? "",
        name,
        location,
        mapsUrl,
        description,
        status: "pending",
        updatedAt: serverTimestamp(),
      }
      if (isFirstSubmit) {
        payload.createdAt = serverTimestamp()
      }

      await setDoc(doc(db, "resorts", joinUser.uid), payload, { merge: true })

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
    <div className="min-h-screen bg-gradient-to-b from-[oklch(0.98_0.01_70)] to-white">
      <DynamicHead brandingOverride={marketplaceHeadBranding} />
      <header className="sticky top-0 z-30 border-b border-emerald-100/60 bg-white/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/resorts" className="flex items-center gap-3">
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

      <main className="mx-auto max-w-6xl px-4 py-10">
        <section
          className="mb-8 grid gap-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm md:grid-cols-3 md:items-center md:p-5"
          aria-label="Resort search and filters"
        >
          <div className="md:col-span-2">
            <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
              Search resorts & room types
            </label>
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-emerald-700/70"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mp.searchPlaceholder}
                autoComplete="off"
                className="h-12 w-full rounded-xl border border-emerald-100 bg-background pl-11 pr-4 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
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

        <div className="mb-8">
          <p className="text-xs font-semibold tracking-[0.35em] uppercase text-emerald-700/70">
            {mp.heroEyebrow}
          </p>
          <h1 className="mt-2 text-4xl font-bold text-emerald-900">
            {mp.heroHeadline}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            {mp.heroSubheadline}
          </p>
        </div>

        <section className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-emerald-900">{filtered.length}</span>{" "}
            resort host{filtered.length === 1 ? "" : "s"}
            <span className="hidden sm:inline"> — </span>
            <span className="mt-1 block max-w-xl text-xs leading-relaxed text-muted-foreground sm:mt-0 sm:inline sm:text-sm">
              Each card is one resort (all their rooms open on that resort’s booking page). Multiple rooms do not
              create multiple marketplace cards.
            </span>
          </p>
          <div className="hidden items-center gap-2 md:flex">
            {mp.featurePills.map((pill) => (
              <span
                key={pill}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
              >
                {pill}
              </span>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
              className="group overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-lg transition hover:-translate-y-1 hover:shadow-2xl"
            >
              <div className="relative h-48 bg-emerald-50">
                <img
                  src={resort.image}
                  alt={resort.name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                />
                <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold tracking-[0.15em] uppercase text-emerald-800 shadow">
                  {resort.category}
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="line-clamp-1 text-lg font-bold text-emerald-900">
                      {resort.name}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin size={14} className="text-emerald-700/70" />
                      <span className="line-clamp-1">{resort.location}</span>
                    </p>
                    {resort.listingSubtitle ? (
                      <p className="mt-1.5 text-xs font-medium text-emerald-800/90">{resort.listingSubtitle}</p>
                    ) : null}
                    {resort.description ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {resort.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    <Star size={14} className="text-amber-600" />
                    {resort.rating.toFixed(1)}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {resort.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                      From
                    </p>
                    <p className="text-2xl font-bold text-emerald-900">
                      {resort.fromPrice > 0 ? (
                        <>
                          {formatPeso(resort.fromPrice)}
                          <span className="ml-1 text-sm font-normal text-muted-foreground">
                            /night
                          </span>
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
                    Book
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>

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
                      className="h-10 w-10 flex-shrink-0 rounded-full object-cover border border-emerald-100 bg-white"
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
                    <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
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

            <div className="md:col-span-2 bg-gradient-to-br from-emerald-700 to-emerald-600 p-6 md:p-8 text-white">
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
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
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

