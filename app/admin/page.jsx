"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  deleteField,
} from "firebase/firestore"
import {
  BedDouble,
  CalendarCheck,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Paintbrush,
  Star,
  Sun,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { auth, db, googleProvider } from "@/lib/firebase"
import { BRANDING_DEFAULTS, useBranding } from "@/hooks/use-branding"
import { useResortOwnerBranding } from "@/hooks/use-resort-owner-branding"
import { useMarketplaceSettings } from "@/hooks/use-marketplace-settings"
import { normalizeOwnerUidFromSearchParam } from "@/lib/booking-tenant"
import { useIsMobile } from "@/hooks/use-mobile"
import Cropper from "react-easy-crop"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AddRoomModal } from "@/components/admin/add-room-modal"
import { PreviewRoomModal } from "@/components/admin/preview-room-modal"
import ManageBookings from "@/components/admin/pages/manage-bookings"
import ManageContact from "@/components/admin/pages/manage-contact"
import ManageFeedback from "@/components/admin/pages/manage-feedback"
import AdminOverview from "@/components/admin/pages/admin-overview"
import PaymentIntegrationSettings from "@/components/admin/payment-integration-settings"
const ALLOWED_ADMINS = ["admin@luxestay.com", "resort.helpdesk01@gmail.com"]

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "manage-rooms", label: "Manage Rooms", icon: BedDouble },
  { key: "manage-bookings", label: "Manage Bookings", icon: CalendarCheck },
  { key: "contact-messages", label: "Contact Messages", icon: MessageCircle },
  { key: "manage-feedback", label: "Manage Feedback", icon: Star },
  { key: "brand-settings", label: "Brand Settings", icon: Paintbrush },
  { key: "payment-integration", label: "Payments", icon: Wallet },
]

/** Hero export: smaller file uploads faster; still sharp at typical viewport widths */
const HERO_EXPORT_W = 1280
const HERO_EXPORT_H = 720
const HERO_JPEG_QUALITY = 0.82
/** Firestore docs max ~1 MiB; hero shares the branding doc with logo/favicon text fields */
const MAX_HERO_DATA_URL_CHARS = 520_000

export default function AdminPage() {
  const { branding: globalBranding, updateBranding: updateGlobalBranding } = useBranding()
  const { settings: marketplace } = useMarketplaceSettings()
  const isMobile = useIsMobile()
  const [currentPage, setCurrentPage] = useState("dashboard")
  const [adminUser, setAdminUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState("")
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [accessMessage, setAccessMessage] = useState("")
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [brandForm, setBrandForm] = useState(() => ({
    ...BRANDING_DEFAULTS,
  }))
  const [brandSaved, setBrandSaved] = useState(false)
  const [brandSaving, setBrandSaving] = useState(false)
  const [heroCropOpen, setHeroCropOpen] = useState(false)
  const [heroCropSrc, setHeroCropSrc] = useState("")
  const [heroCrop, setHeroCrop] = useState({ x: 0, y: 0 })
  const [heroZoom, setHeroZoom] = useState(1)
  const [heroCroppedPixels, setHeroCroppedPixels] = useState(null)
  const [heroUploading, setHeroUploading] = useState(false)
  const [listingForm, setListingForm] = useState(() => ({
    location: "",
    mapsUrl: "",
    description: "",
    category: "Resort",
    listingImage: "",
    tags: "",
    published: false,
    resortStatus: "",
  }))
  const [listingLoading, setListingLoading] = useState(false)
  const [listingSaving, setListingSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [ownerApproved, setOwnerApproved] = useState(false)
  const didBootstrapBranding = useRef(false)
  const [addRoomOpen, setAddRoomOpen] = useState(false)
  const [previewRoom, setPreviewRoom] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [loginOwnerUid, setLoginOwnerUid] = useState(null)
  const ROOMS_PER_PAGE = 6
  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState("")
  const [roomsPage, setRoomsPage] = useState(1)
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin-theme")
      return (saved === "dark" || saved === "light") ? saved : "light"
    }
    return "light"
  })
  const isLegacyHelpdesk = Boolean(adminUser?.email && ALLOWED_ADMINS.includes(adminUser.email))
  const tenantOwnerUid = adminUser && !isLegacyHelpdesk ? adminUser.uid : null
  const { branding: ownerBrandingSnapshot, updateBranding: updateOwnerBranding } =
    useResortOwnerBranding(tenantOwnerUid)
  const { branding: loginOwnerBranding } = useResortOwnerBranding(loginOwnerUid)

  const branding = tenantOwnerUid ? (ownerBrandingSnapshot ?? BRANDING_DEFAULTS) : globalBranding
  const updateBranding = tenantOwnerUid ? updateOwnerBranding : updateGlobalBranding

  // Keep form in sync with per-owner branding when it loads.
  useEffect(() => {
    if (!tenantOwnerUid || isLegacyHelpdesk) return
    setBrandForm((prev) => {
      const next = ownerBrandingSnapshot ?? BRANDING_DEFAULTS
      // Only replace when snapshot exists; otherwise keep whatever user is editing locally.
      if (!ownerBrandingSnapshot) return prev
      return { ...prev, ...next }
    })
  }, [tenantOwnerUid, isLegacyHelpdesk, ownerBrandingSnapshot])

  const sidebarBrandName = (branding.name || BRANDING_DEFAULTS.name).trim().split(" ")[0] || BRANDING_DEFAULTS.name

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = new URLSearchParams(window.location.search).get("o")
    const normalized = normalizeOwnerUidFromSearchParam(raw)
    setLoginOwnerUid(normalized)
  }, [])

  const getInitials = (raw) => {
    const name = String(raw || "").trim()
    if (!name) return "R"
    const parts = name.split(/\s+/).filter(Boolean)
    const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).filter(Boolean)
    return (letters.join("") || name[0]?.toUpperCase() || "R").slice(0, 2)
  }

  const BrandLogo = ({ className, textClassName, label }) => {
    const alt = label || `${branding.name} logo`
    if (branding.logo) {
      return <img src={branding.logo} alt={alt} className={className} />
    }
    return (
      <div
        aria-label={alt}
        className={`${className} flex items-center justify-center ${textClassName || ""}`}
      >
        <LayoutDashboard className="h-5 w-5" strokeWidth={2.2} />
      </div>
    )
  }

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("admin-theme", theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }

  useEffect(() => {
    if (!db || !tenantOwnerUid || isLegacyHelpdesk) {
      setOwnerApproved(false)
      return undefined
    }
    return onSnapshot(doc(db, "resortOwners", tenantOwnerUid), (snap) => {
      const st = String(snap.data()?.status || "").trim().toLowerCase()
      setOwnerApproved(st === "approved")
    })
  }, [tenantOwnerUid, isLegacyHelpdesk])

  useEffect(() => {
    if (!db || !tenantOwnerUid || isLegacyHelpdesk) return undefined
    setListingLoading(true)
    const unsub = onSnapshot(
      doc(db, "resorts", tenantOwnerUid),
      (snap) => {
        const d = snap.exists() ? snap.data() : {}
        setListingForm((prev) => ({
          ...prev,
          location: typeof d.location === "string" ? d.location : prev.location,
          mapsUrl: typeof d.mapsUrl === "string" ? d.mapsUrl : prev.mapsUrl,
          description: typeof d.description === "string" ? d.description : prev.description,
          category: typeof d.category === "string" && d.category.trim() ? d.category : prev.category,
          listingImage: typeof d.listingImage === "string" ? d.listingImage : prev.listingImage,
          tags: Array.isArray(d.tags) ? d.tags.join(", ") : typeof d.tags === "string" ? d.tags : prev.tags,
          published: Boolean(d.published),
          resortStatus: String(d.status || ""),
        }))

        // Prefill admin branding from resort registration (only if branding still default).
        // Resort name is originally captured in `resorts/{uid}.name`, while admin UI reads `resortOwners/{uid}/site/branding`.
        const resortName = typeof d.name === "string" ? d.name.trim() : ""
        const resortDesc = typeof d.description === "string" ? d.description.trim() : ""
        if (
          resortName &&
          !didBootstrapBranding.current &&
          (!ownerBrandingSnapshot || ownerBrandingSnapshot.name === BRANDING_DEFAULTS.name)
        ) {
          didBootstrapBranding.current = true
          // Only merge listing identity — never write global LuxeStay defaults into Firestore.
          const patch = {
            name: resortName,
            tagline: resortDesc ? resortDesc.slice(0, 80) : (ownerBrandingSnapshot?.tagline?.trim() || ""),
            aboutBody: resortDesc || (ownerBrandingSnapshot?.aboutBody?.trim() || ""),
          }
          updateOwnerBranding(patch).catch(() => {})
          setBrandForm((prev) => ({ ...prev, ...patch }))
        }
        setListingLoading(false)
      },
      () => setListingLoading(false),
    )
    return () => unsub()
  }, [tenantOwnerUid, isLegacyHelpdesk, ownerBrandingSnapshot, updateOwnerBranding])

  /** Fields required only to publish (contact + resort name + ≥1 room). Listing copy can be filled later. */
  const publishMissing = useMemo(() => {
    const missing = []
    if (!tenantOwnerUid || isLegacyHelpdesk) return missing
    if (!String(brandForm.name || "").trim()) missing.push("Resort name")
    if (!String(brandForm.address || "").trim()) missing.push("Address")
    if (!String(brandForm.phone || "").trim()) missing.push("Phone")
    if (!String(brandForm.email || "").trim()) missing.push("Email")
    if (!roomsLoading && rooms.length === 0) missing.push("At least one room (Manage Rooms)")
    return missing
  }, [brandForm, tenantOwnerUid, isLegacyHelpdesk, roomsLoading, rooms.length])

  const listingPreviewUrl =
    tenantOwnerUid && typeof window !== "undefined"
      ? `${window.location.origin}/?o=${encodeURIComponent(tenantOwnerUid)}`
      : ""

  const canPublish =
    !roomsLoading &&
    ownerApproved &&
    String(listingForm.resortStatus || "").trim().toLowerCase() === "approved" &&
    publishMissing.length === 0

  const handleListingSave = async () => {
    if (!db || !tenantOwnerUid || isLegacyHelpdesk) return
    setListingSaving(true)
    try {
      const tags = String(listingForm.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10)
      await setDoc(
        doc(db, "resorts", tenantOwnerUid),
        {
          ownerUid: tenantOwnerUid,
          name: String(brandForm.name || "").trim(),
          location: String(listingForm.location || "").trim(),
          mapsUrl: String(listingForm.mapsUrl || "").trim(),
          description: String(listingForm.description || "").trim(),
          category: String(listingForm.category || "Resort").trim() || "Resort",
          listingImage: String(listingForm.listingImage || "").trim(),
          tags,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      toast.success("Marketplace listing saved.")
    } catch (e) {
      console.error(e)
      toast.error(e?.message || "Failed to save listing.")
    } finally {
      setListingSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!db || !tenantOwnerUid || isLegacyHelpdesk) return
    if (!ownerApproved) {
      toast.error("Your owner account must be approved first.")
      return
    }
    if (String(listingForm.resortStatus || "").trim().toLowerCase() !== "approved") {
      toast.error("Your resort listing must be approved by admin before publishing.")
      return
    }
    if (publishMissing.length) {
      toast.error(`Cannot publish yet: ${publishMissing.join(", ")}`)
      return
    }
    setPublishing(true)
    try {
      await setDoc(
        doc(db, "resorts", tenantOwnerUid),
        { published: true, publishedAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true },
      )
      const preview =
        typeof window !== "undefined"
          ? `${window.location.origin}/?o=${encodeURIComponent(tenantOwnerUid)}`
          : ""
      toast.success(
        <span className="inline-flex flex-col gap-1">
          <span>Published to Marketplace.</span>
          {preview ? (
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
            >
              Open booking site preview
            </a>
          ) : null}
        </span>,
      )
    } catch (e) {
      console.error(e)
      toast.error(e?.message || "Failed to publish.")
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const run = async () => {
        if (!firebaseUser) {
          setAdminUser(null)
          setAuthError("")
          setAccessMessage("")
          setAuthLoading(false)
          return
        }

        const email = firebaseUser.email ?? ""
        const isWhitelisted = ALLOWED_ADMINS.includes(email)

        // Legacy/internal admins: always allow
        if (ALLOWED_ADMINS.length && isWhitelisted) {
          setAdminUser(firebaseUser)
          setAuthError("")
          setAccessMessage("")
          setAuthLoading(false)
          return
        }

        // Resort owner access: must exist and be approved
        try {
          const ownerSnap = await getDoc(doc(db, "resortOwners", firebaseUser.uid))

          if (!ownerSnap.exists()) {
            setAdminUser(null)
            setAuthError("")
            setAccessMessage("This account has no resort owner record yet. Please join from the marketplace first.")
            setAuthLoading(false)
            return
          }

          const status = String(ownerSnap.data()?.status || "pending").toLowerCase()
          if (status !== "approved") {
            const reason = String(ownerSnap.data()?.rejectionReason || "").trim()
            setAdminUser(null)
            setAuthError("")
            setAccessMessage(
              status === "rejected" && reason
                ? `This account was rejected: ${reason}`
                : "This account is not approved yet. Please wait for admin approval.",
            )
            setAuthLoading(false)
            return
          }

          setAdminUser(firebaseUser)
          setAuthError("")
          setAccessMessage("")
          setAuthLoading(false)
        } catch (error) {
          console.error("Failed to verify resort owner access", error)
          setAdminUser(null)
          setAuthError("")
          setAccessMessage("Unable to verify this account right now. Please try again.")
          setAuthLoading(false)
        }
      }

      setAuthLoading(true)
      run()
    })

    return () => unsubscribe()
  }, [])

  // Global (legacy) admin: keep form in sync with `settings/branding`.
  // Resort owners: DO NOT merge here. While `ownerBrandingSnapshot` is still loading, `branding`
  // is `BRANDING_DEFAULTS` and would overwrite the form (name, contact, etc. "disappearing").
  // Per-resort form sync is handled only by the `ownerBrandingSnapshot` effect above.
  useEffect(() => {
    if (tenantOwnerUid && !isLegacyHelpdesk) return
    setBrandForm((prev) => ({
      ...BRANDING_DEFAULTS,
      ...prev,
      ...branding,
    }))
  }, [branding, tenantOwnerUid, isLegacyHelpdesk])

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return
      if (window.innerWidth < 1024) {
        setSidebarExpanded(false)
    } else {
        setSidebarExpanded(true)
        setMobileSidebarVisible(false)
      }
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    if (!db || !adminUser) {
      setRooms([])
      setRoomsLoading(false)
      return
    }

    const legacy = Boolean(adminUser.email && ALLOWED_ADMINS.includes(adminUser.email))
    setRoomsLoading(true)
    setRoomsError("")

    if (legacy) {
      const roomsQuery = query(collection(db, "rooms"), orderBy("createdAt", "desc"))
      const unsubscribe = onSnapshot(
        roomsQuery,
        (snapshot) => {
          const mapped = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((r) => !r.ownerUid)
          setRooms(mapped)
          setRoomsPage((prev) => {
            const totalPages = Math.max(1, Math.ceil(mapped.length / ROOMS_PER_PAGE))
            return Math.min(prev, totalPages)
          })
          setRoomsLoading(false)
        },
        (error) => {
          console.error("Failed to load rooms", error)
          setRoomsError("Failed to load rooms.")
          setRoomsLoading(false)
        },
      )
      return () => unsubscribe()
    }

    const roomsQuery = query(collection(db, "rooms"), where("ownerUid", "==", adminUser.uid))
    const unsubscribe = onSnapshot(
      roomsQuery,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? 0
            const tb = b.createdAt?.toMillis?.() ?? 0
            return tb - ta
          })
        setRooms(mapped)
        setRoomsPage((prev) => {
          const totalPages = Math.max(1, Math.ceil(mapped.length / ROOMS_PER_PAGE))
          return Math.min(prev, totalPages)
        })
        setRoomsLoading(false)
      },
      (error) => {
        console.error("Failed to load rooms", error)
        setRoomsError("Failed to load rooms.")
        setRoomsLoading(false)
      },
    )
    return () => unsubscribe()
  }, [adminUser])

  const handleBrandFieldChange = (field) => (event) => {
    const { value } = event.target
    setBrandForm((prev) => ({ ...prev, [field]: value }))
  }

  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const readBlobAsDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Check file size (5MB = 5 * 1024 * 1024 bytes)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error("Logo file size must be less than 5MB")
      event.target.value = "" // Reset input
      return
    }

    // Check if it's an image
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file")
      event.target.value = ""
      return
    }

    try {
      const dataURL = await readFileAsDataURL(file)
      setBrandForm((prev) => ({ ...prev, logo: dataURL }))
      toast.success("Logo uploaded successfully")
    } catch (error) {
      console.error("Failed to upload logo:", error)
      toast.error("Failed to upload logo. Please try again.")
    }
    event.target.value = "" // Reset input
  }

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.addEventListener("load", () => resolve(image))
      image.addEventListener("error", (e) => reject(e))
      image.crossOrigin = "anonymous"
      image.src = url
    })

  const getCroppedBlob = async (
    imageSrc,
    cropPixels,
    outWidth = HERO_EXPORT_W,
    outHeight = HERO_EXPORT_H,
  ) => {
    const image = await createImage(imageSrc)
    const canvas = document.createElement("canvas")
    canvas.width = outWidth
    canvas.height = outHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas not supported")

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    ctx.drawImage(
      image,
      cropPixels.x * scaleX,
      cropPixels.y * scaleY,
      cropPixels.width * scaleX,
      cropPixels.height * scaleY,
      0,
      0,
      outWidth,
      outHeight,
    )

    return await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", HERO_JPEG_QUALITY)
    })
  }

  const handleHeroSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const maxSize = 8 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error("Hero image must be less than 8MB")
      event.target.value = ""
      return
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file")
      event.target.value = ""
      return
    }
    try {
      const dataURL = await readFileAsDataURL(file)
      setHeroCropSrc(String(dataURL || ""))
      setHeroCrop({ x: 0, y: 0 })
      setHeroZoom(1)
      setHeroCroppedPixels(null)
      setHeroCropOpen(true)
    } catch (e) {
      console.error(e)
      toast.error("Failed to load image.")
    } finally {
      event.target.value = ""
    }
  }

  const handleHeroCropConfirm = async () => {
    if (!db) {
      toast.error("Database not available.")
      return
    }
    if (!heroCropSrc || !heroCroppedPixels) {
      toast.error("Please crop the image first.")
      return
    }
    setHeroUploading(true)
    try {
      const blob = await getCroppedBlob(heroCropSrc, heroCroppedPixels)
      if (!blob) throw new Error("Failed to crop image.")
      const dataUrl = await readBlobAsDataURL(blob)
      if (dataUrl.length > MAX_HERO_DATA_URL_CHARS) {
        toast.error(
          "Hero image is too large for Firestore (1 MB document limit). Try a simpler photo or reduce logo size first.",
        )
        return
      }
      setBrandForm((prev) => ({ ...prev, heroImageUrl: dataUrl }))
      setHeroCropOpen(false)
      toast.success("Hero image updated. Save branding to apply.")
    } catch (e) {
      console.error(e)
      toast.error(e?.message || "Failed to process hero image.")
    } finally {
      setHeroUploading(false)
    }
  }

  const handleBrandingSubmit = async (event) => {
    event.preventDefault()
    setBrandSaving(true)
    console.log("handleBrandingSubmit called with brandForm:", brandForm)
    try {
      const payload =
        tenantOwnerUid && !isLegacyHelpdesk
          ? { ...brandForm, tabTitle: deleteField(), favicon: deleteField() }
          : brandForm
      await updateBranding(payload)
      setBrandSaved(true)
      toast.success("Branding saved successfully to Firebase.")
      setTimeout(() => setBrandSaved(false), 2500)
    } catch (error) {
      console.error("Failed to save branding", error)
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      })
      toast.error(`Failed to save branding: ${error.message || "Please try again."}`)
    } finally {
      setBrandSaving(false)
    }
  }

  const handleGoogleLogin = async () => {
    setAuthSubmitting(true)
    setAuthError("")
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      console.error("Google login failed", error)
      setAuthError("Google login failed. Please try again.")
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setLogoutDialogOpen(true)
  }

  const confirmLogout = async () => {
    setLogoutDialogOpen(false)
    await signOut(auth)
    setAdminUser(null)
    setCurrentPage("dashboard")
    toast.success("Logged out successfully")
  }

  const handleRoomSave = async (payload) => {
    try {
      const legacy = Boolean(adminUser?.email && ALLOWED_ADMINS.includes(adminUser.email))
      const ownerUid = !legacy && adminUser?.uid ? adminUser.uid : null
      await addDoc(collection(db, "rooms"), {
        name: payload.name,
        roomNumber: payload.number,
        type: payload.type,
        description: payload.description,
        price: Number(payload.price) || 0,
        discount: Number(payload.discount) || 0,
        maxGuests: Number(payload.maxGuests) || 1,
        bedType: payload.bedType,
        beds: Number(payload.beds) || 1,
        amenities: payload.amenities,
        availability: payload.availability,
        featured: Boolean(payload.featured),
        images: payload.images,
        createdAt: serverTimestamp(),
        ...(ownerUid ? { ownerUid } : {}),
      })

      toast.success("Room saved successfully.")
      setAddRoomOpen(false)
    } catch (error) {
      console.error("Failed to save room", error)
      toast.error("Failed to save room. Please try again.")
      throw error
    }
  }

  const handleRoomUpdate = async (payload) => {
    const roomId = payload.id || previewRoom?.id
    if (!roomId) return
    try {
      await updateDoc(doc(db, "rooms", roomId), {
        name: payload.name,
        roomNumber: payload.number,
        type: payload.type,
        description: payload.description,
        price: Number(payload.price) || 0,
        discount: Number(payload.discount) || 0,
        maxGuests: Number(payload.maxGuests) || 1,
        bedType: payload.bedType,
        beds: Number(payload.beds) || 1,
        amenities: payload.amenities,
        availability: payload.availability,
        featured: Boolean(payload.featured),
        images: payload.images,
        updatedAt: serverTimestamp(),
      })
      toast.success("Room updated successfully.")
      setPreviewOpen(false)
      setPreviewRoom(null)
    } catch (error) {
      console.error("Failed to update room", error)
      toast.error("Failed to update room. Please try again.")
      throw error
    }
  }

  const handleRoomDelete = async (roomId) => {
    if (!roomId) return
    setDeletingId(roomId)
    try {
      await deleteDoc(doc(db, "rooms", roomId))
      toast.success("Room deleted successfully.")
      setPendingDeleteId(null)
    } catch (error) {
      console.error("Failed to delete room", error)
      toast.error("Failed to delete room. Please try again.")
    } finally {
      setDeletingId(null)
    }
  }

  const totalRoomPages = Math.max(1, Math.ceil(rooms.length / ROOMS_PER_PAGE))
  const paginatedRooms = rooms.slice((roomsPage - 1) * ROOMS_PER_PAGE, roomsPage * ROOMS_PER_PAGE)

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
        <p className="text-gray-500 tracking-[0.2em] uppercase">Preparing portal…</p>
      </div>
    )
  }

  if (!adminUser) {
    const loginBranding = loginOwnerBranding
      ? loginOwnerBranding
      : {
          ...BRANDING_DEFAULTS,
          name: marketplace?.navTitle || "Resort Marketplace",
          tagline: marketplace?.navSubtitle || "Choose your resort",
          logo: marketplace?.navLogoUrl || "",
        }
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-100 bg-white shadow-sm">
              {loginBranding.logo ? (
                <img
                  src={loginBranding.logo}
                  alt={`${loginBranding.name} logo`}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div
                  aria-label={`${loginBranding.name} logo`}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold uppercase text-emerald-700"
                >
                  {getInitials(loginBranding.name)}
                </div>
              )}
            </div>
            <h1 className="text-4xl font-bold text-emerald-700 mb-1 tracking-[0.2em] uppercase">{loginBranding.name}</h1>
            <p className="text-gray-600">{loginBranding.tagline || "Admin Portal"}</p>
          </div>

          <div className="bg-white rounded-xl p-8 shadow-lg border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Sign in with Google</h2>

            {authError && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg text-sm">{authError}</div>}
            {accessMessage && <div className="mb-4 p-4 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200">{accessMessage}</div>}

              <button
              onClick={handleGoogleLogin}
              disabled={authSubmitting}
              className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-70 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition flex items-center justify-center gap-3"
              >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 488 512"
                className="h-5 w-5"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C244.5 52.6 74.4 116.6 74.4 256c0 86.5 69.1 156.6 153.6 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4"
                />
              </svg>
              {authSubmitting ? "Connecting…" : "Continue with Google"}
              </button>

            <p className="mt-4 text-xs text-gray-500 text-center">
              Approved resort owners can access this dashboard. Internal admins are also allowed.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Toaster position="top-center" richColors />
        <div
        className={`fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          mobileSidebarVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
          onClick={() => setMobileSidebarVisible(false)}
        />
    <div className={`flex h-screen transition-colors duration-300 ${
      theme === "dark" 
        ? "bg-gradient-to-b from-slate-900 to-slate-800" 
        : "bg-gradient-to-b from-slate-50 to-white"
    }`}>
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-full flex-col shadow-2xl transition-all duration-300 ease-in-out lg:static lg:shadow-none ${
            theme === "dark"
              ? "bg-slate-800 text-white border-r border-slate-700"
              : "bg-emerald-900 text-white"
          } ${
            mobileSidebarVisible 
              ? "translate-x-0 w-64" 
              : "-translate-x-full w-64 lg:translate-x-0"
          } ${
            sidebarExpanded ? "lg:w-64" : "lg:w-20"
          }`}
        >
          <div className={`relative flex items-center gap-3 border-b transition-all duration-300 ${
            theme === "dark" ? "border-slate-700" : "border-emerald-800"
          } ${
            sidebarExpanded ? "px-5" : "px-3 lg:px-3"
          } py-6`}>
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-emerald-600 bg-white/10">
              <BrandLogo className="h-9 w-9 rounded-full bg-white/10 text-white" />
        </div>
            <div
              className={`overflow-hidden transition-all duration-300 ${
                (mobileSidebarVisible || sidebarExpanded)
                  ? "max-w-full opacity-100" 
                  : "max-w-0 opacity-0 lg:max-w-0 lg:opacity-0"
              }`}
            >
              <p className="text-lg font-bold tracking-[0.2em] uppercase whitespace-nowrap">{sidebarBrandName}</p>
              <p className="text-[11px] text-emerald-200 whitespace-nowrap">{branding.tagline || "Admin Portal"}</p>
              <p className="text-[10px] text-emerald-200/70 mt-1 truncate">{adminUser?.email}</p>
            </div>
            <button
              onClick={() => setMobileSidebarVisible(false)}
              className="absolute right-4 top-6 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white transition-all duration-200 hover:bg-white/10 lg:hidden"
            >
              <X size={18} />
            </button>
            <button
              onClick={() => setSidebarExpanded((prev) => !prev)}
              className="absolute -right-4 top-8 hidden h-9 w-9 items-center justify-center rounded-full border border-emerald-700 bg-emerald-900 text-white shadow-xl transition-all duration-200 hover:bg-emerald-800 lg:inline-flex"
            >
              {sidebarExpanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
            </button>
          </div>

          <nav className={`flex-1 space-y-2 px-3 py-5 transition-all duration-300 ${
            sidebarExpanded 
              ? "overflow-y-auto" 
              : "overflow-hidden lg:overflow-hidden"
          }`}>
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
              const isActive = currentPage === key
              return (
                <button
                  key={key}
                  onClick={() => {
                    setCurrentPage(key)
                    setMobileSidebarVisible(false)
                  }}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold tracking-wide transition-all duration-200 ${
                    theme === "dark"
                      ? isActive
                        ? "bg-slate-700 text-white shadow-inner"
                        : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
                      : isActive
                        ? "bg-white/15 text-white shadow-inner shadow-emerald-900/40"
                        : "text-emerald-100 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span
                    className={`truncate transition-all duration-300 ${
                      (mobileSidebarVisible || sidebarExpanded)
                        ? "max-w-full opacity-100" 
                        : "max-w-0 opacity-0 lg:max-w-0 lg:opacity-0"
                    }`}
                  >
                    {label}
                  </span>
                  {!sidebarExpanded && (
                    <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl transition-all duration-200 group-hover:opacity-100 z-50">
                      {label}
                    </span>
                  )}
                </button>
              )
            })}
        </nav>

          <div className={`border-t transition-all duration-300 ${
            theme === "dark" ? "border-slate-700" : "border-emerald-800"
          } ${
            sidebarExpanded ? "px-5" : "px-3 lg:px-3"
          } py-5 space-y-3`}>
            <div
              className={`text-sm overflow-hidden transition-all duration-300 ${
                (mobileSidebarVisible || sidebarExpanded)
                  ? "max-w-full opacity-100" 
                  : "max-w-0 opacity-0 lg:max-w-0 lg:opacity-0"
              }`}
            >
              <p className={`text-xs uppercase tracking-[0.25em] whitespace-nowrap ${
                theme === "dark" ? "text-slate-400" : "text-emerald-200"
              }`}>Signed in as</p>
              <p className="font-semibold whitespace-nowrap">{adminUser?.displayName ?? "Administrator"}</p>
            </div>
            
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`relative w-full rounded-lg py-2 font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                theme === "dark"
                  ? "bg-slate-700 text-white hover:bg-slate-600"
                  : "bg-emerald-800 text-white hover:bg-emerald-700"
              }`}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <span className={`transition-all duration-300 ${
                (mobileSidebarVisible || sidebarExpanded)
                  ? "opacity-100 max-w-full" 
                  : "opacity-0 max-w-0 overflow-hidden lg:opacity-0 lg:max-w-0"
              }`}>
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </span>
              <span className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                (mobileSidebarVisible || sidebarExpanded)
                  ? "opacity-0 pointer-events-none"
                  : "opacity-100 lg:opacity-100"
              }`}>
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </span>
              {(mobileSidebarVisible || sidebarExpanded) && (
                <span className="flex-shrink-0">
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </span>
              )}
            </button>
            
          <button
              onClick={handleLogout}
              className="relative w-full rounded-lg bg-red-600 py-2 font-semibold text-white transition-all duration-200 hover:bg-red-700 flex items-center justify-center"
          >
              <span className={`transition-all duration-300 ${
                (mobileSidebarVisible || sidebarExpanded)
                  ? "opacity-100 max-w-full" 
                  : "opacity-0 max-w-0 overflow-hidden lg:opacity-0 lg:max-w-0"
              }`}>
            Logout
              </span>
              {!(mobileSidebarVisible || sidebarExpanded) && (
                <span className="absolute inset-0 flex items-center justify-center opacity-0 lg:opacity-100 transition-opacity duration-300">
                  <LogOut size={18} />
                </span>
              )}
          </button>
          </div>
        </aside>

        <main className={`flex-1 overflow-auto transition-colors duration-300 ${
          theme === "dark" ? "bg-slate-900" : "bg-background"
        } ${
          sidebarExpanded ? "lg:ml-0" : "lg:ml-0"
        }`}>
          <div className="p-6 lg:p-8">
            <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
              <button
                onClick={() => setMobileSidebarVisible((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm"
              >
                <Menu size={18} />
                Menu
              </button>
              <div className="flex items-center gap-3 rounded-full border border-emerald-100 bg-white/70 px-4 py-2 shadow-sm">
                  <BrandLogo className="h-9 w-9 rounded-full bg-white/10 text-white" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-emerald-900">{branding.name}</p>
                  <p className="text-xs text-gray-500">{branding.tagline || "Admin Portal"}</p>
                </div>
        </div>
      </div>
          {currentPage === "dashboard" && (
            <AdminOverview isLegacyHelpdesk={isLegacyHelpdesk} ownerUid={tenantOwnerUid} />
          )}

          {currentPage === "manage-rooms" && (
            <div>
              <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className={`text-3xl font-bold ${
                    theme === "dark" ? "text-white" : "text-gray-800"
                  }`}>Manage Rooms</h1>
                  <p className={`text-sm ${
                    theme === "dark" ? "text-gray-400" : "text-gray-500"
                  }`}>Add new rooms or update existing inventory.</p>
                </div>
                <button
                  onClick={() => setAddRoomOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-700/30 transition hover:-translate-y-0.5 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  <span className="text-lg leading-none">+</span>
                  Add Room
                      </button>
                    </div>

              {roomsLoading ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  {[0, 1, 2].map((idx) => (
                    <div key={idx} className={`rounded-2xl border p-6 shadow animate-pulse ${
                      theme === "dark" 
                        ? "border-slate-700 bg-slate-800" 
                        : "border-emerald-50 bg-white"
                    }`}>
                      <div className={`mb-4 h-4 w-1/3 rounded ${
                        theme === "dark" ? "bg-slate-700" : "bg-slate-200"
                      }`} />
                      <div className={`mb-6 h-3 w-2/3 rounded ${
                        theme === "dark" ? "bg-slate-700" : "bg-slate-100"
                      }`} />
                      <div className={`h-10 rounded ${
                        theme === "dark" ? "bg-slate-700" : "bg-slate-100"
                      }`} />
                  </div>
                ))}
              </div>
              ) : roomsError ? (
                <div className={`rounded-2xl border p-5 text-sm ${
                  theme === "dark"
                    ? "border-red-800 bg-red-900/30 text-red-300"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}>{roomsError}</div>
              ) : rooms.length ? (
                <>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {paginatedRooms.map((room) => (
                    <div
                      key={room.id}
                      className={`group flex h-full flex-col rounded-2xl border p-6 shadow transition hover:-translate-y-1 ${
                        theme === "dark"
                          ? "border-slate-700 bg-slate-800 hover:shadow-slate-700/50"
                          : "border-emerald-50 bg-white hover:shadow-emerald-200"
                      }`}
                    >
                      <div className="relative mb-4">
                        {room.images?.[0] ? (
                          <img
                            src={room.images[0]}
                            alt={`${room.name} preview`}
                            className="h-36 w-full rounded-xl object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className={`flex h-36 w-full items-center justify-center rounded-xl border border-dashed text-sm ${
                            theme === "dark"
                              ? "border-slate-600 bg-slate-700/50 text-slate-400"
                              : "border-emerald-100 bg-emerald-50/50 text-emerald-700"
                          }`}>
                            No preview
            </div>
          )}
                        <button
                          onClick={() => {
                            setPreviewRoom(room)
                            setPreviewOpen(true)
                          }}
                          className={`absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border shadow transition ${
                            theme === "dark"
                              ? "border-slate-600/40 bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                              : "border-white/40 bg-white/80 text-emerald-800 hover:bg-white"
                          }`}
                          title="Preview room"
                        >
                          <Eye size={18} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`text-lg font-bold line-clamp-1 ${
                          theme === "dark" ? "text-white" : "text-emerald-700"
                        }`}>{room.name}</h3>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              theme === "dark"
                                ? room.availability === "Available"
                                  ? "bg-emerald-900/50 text-emerald-300"
                                  : room.availability === "Maintenance"
                                    ? "bg-amber-900/50 text-amber-300"
                                    : "bg-slate-700 text-slate-300"
                                : room.availability === "Available"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : room.availability === "Maintenance"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {room.availability}
                          </span>
                          {pendingDeleteId === room.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleRoomDelete(room.id)}
                                disabled={deletingId === room.id}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:border-red-400 disabled:opacity-60"
                                title="Confirm delete"
                              >
                                {deletingId === room.id ? (
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
                                ) : (
                                  <Check size={16} />
                                )}
                              </button>
                              <button
                                onClick={() => setPendingDeleteId(null)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-gray-400"
                                title="Cancel"
                              >
                                <X size={16} />
                            </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setPendingDeleteId(room.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:border-red-400"
                              title="Delete room"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className={`mt-2 text-sm ${
                        theme === "dark" ? "text-gray-400" : "text-gray-500"
                      }`}>
                        ₱{(room.price ?? 0).toLocaleString()} / night • {room.maxGuests ?? 1} guests
                    </p>
                      <div className={`mt-4 flex flex-wrap gap-2 text-xs ${
                        theme === "dark" ? "text-gray-400" : "text-gray-500"
                      }`}>
                        <span className={`rounded-full px-3 py-1 ${
                          theme === "dark" ? "bg-slate-700" : "bg-gray-100"
                        }`}>Type: {room.type}</span>
                        <span className={`rounded-full px-3 py-1 ${
                          theme === "dark" ? "bg-slate-700" : "bg-gray-100"
                        }`}>Beds: {room.beds}</span>
                        {room.featured && <span className={`rounded-full px-3 py-1 ${
                          theme === "dark" ? "bg-amber-900/50 text-amber-300" : "bg-amber-100 text-amber-700"
                        }`}>Featured</span>}
                      </div>
                      {room.amenities?.length > 0 && (
                        <div className={`mt-4 flex flex-wrap gap-2 text-xs ${
                          theme === "dark" ? "text-gray-300" : "text-gray-600"
                        }`}>
                          {room.amenities.slice(0, 4).map((amenity, index) => (
                            <span key={`${room.id}-amenity-${index}`} className={`rounded-full px-2 py-1 ${
                              theme === "dark" ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                            }`}>
                              {amenity}
                            </span>
                          ))}
                          {room.amenities.length > 4 && (
                            <span className={`rounded-full px-2 py-1 ${
                              theme === "dark" ? "bg-slate-700 text-gray-300" : "bg-gray-100 text-gray-600"
                            }`}>+{room.amenities.length - 4} more</span>
                          )}
                        </div>
                      )}
                          </div>
                    ))}
                  </div>
                  {totalRoomPages > 1 && (
                    <div className={`mt-6 flex flex-col items-center gap-3 text-sm md:flex-row md:justify-between ${
                      theme === "dark" ? "text-gray-300" : "text-gray-600"
                    }`}>
                      <button
                        onClick={() => setRoomsPage((prev) => Math.max(1, prev - 1))}
                        disabled={roomsPage === 1}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          theme === "dark"
                            ? "border-emerald-700 text-emerald-300 hover:border-emerald-600"
                            : "border-emerald-200 text-emerald-800 hover:border-emerald-400"
                        }`}
                      >
                        Previous
                      </button>
                      <p className="font-medium">
                        Page {roomsPage} of {totalRoomPages}
                      </p>
                      <button
                        onClick={() => setRoomsPage((prev) => Math.min(totalRoomPages, prev + 1))}
                        disabled={roomsPage === totalRoomPages}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          theme === "dark"
                            ? "border-emerald-700 text-emerald-300 hover:border-emerald-600"
                            : "border-emerald-200 text-emerald-800 hover:border-emerald-400"
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className={`rounded-2xl border border-dashed p-8 text-center text-sm ${
                  theme === "dark"
                    ? "border-emerald-800 bg-slate-800 text-gray-400"
                    : "border-emerald-200 bg-white text-gray-500"
                }`}>
                  No rooms added yet. Click "Add Room" to create one.
              </div>
              )}
            </div>
          )}

          {currentPage === "manage-bookings" && (
            <ManageBookings
              isLegacyHelpdesk={isLegacyHelpdesk}
              ownerUid={tenantOwnerUid}
              invoiceBusiness={{
                name: brandForm.name,
                address: brandForm.address,
                phone: brandForm.phone,
                email: brandForm.email,
              }}
            />
          )}

          {currentPage === "contact-messages" && (
            <ManageContact isLegacyHelpdesk={isLegacyHelpdesk} ownerUid={tenantOwnerUid} />
          )}

          {currentPage === "manage-feedback" && (
            <ManageFeedback isLegacyHelpdesk={isLegacyHelpdesk} ownerUid={tenantOwnerUid} />
          )}


          {currentPage === "brand-settings" && (
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-8">Brand Settings</h1>
              <div className="grid gap-8 lg:grid-cols-2">
                <form onSubmit={handleBrandingSubmit} className="space-y-6 rounded-xl bg-card p-6 shadow-lg">
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">Name &amp; logo</h2>
                  <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">Resort / brand name</label>
                    <input
                      type="text"
                        value={brandForm.name || ""}
                      onChange={handleBrandFieldChange("name")}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Your resort name"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">
                      Tagline <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={brandForm.tagline || ""}
                      onChange={handleBrandFieldChange("tagline")}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Short line under your name on the landing page"
                    />
                  </div>
                  <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">
                        Logo <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-foreground transition hover:bg-secondary">
                            <Upload size={16} />
                            <span className="text-sm font-medium">Upload Logo</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoUpload}
                              className="hidden"
                            />
                          </label>
                          {brandForm.logo && (
                            <button
                              type="button"
                              onClick={() => setBrandForm((prev) => ({ ...prev, logo: "" }))}
                              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        {brandForm.logo && (
                          <div className="relative rounded-lg border border-border bg-secondary p-3">
                            <img
                              src={brandForm.logo}
                              alt="Logo preview"
                              className="mx-auto max-h-24 w-auto object-contain"
                            />
                          </div>
                        )}
                        <input
                          type="url"
                          value={brandForm.logo?.startsWith("data:") ? "" : (brandForm.logo || "")}
                          onChange={handleBrandFieldChange("logo")}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="https://…/logo.png"
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Upload or paste image URL. Empty = initials in the nav.
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">Hero background image</label>
                      <div className="space-y-3">
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-foreground transition hover:bg-secondary">
                          <Upload size={16} />
                          <span className="text-sm font-medium">Upload & crop hero image</span>
                          <input type="file" accept="image/*" onChange={handleHeroSelect} className="hidden" />
                        </label>
                        {brandForm.heroImageUrl ? (
                          <div className="relative overflow-hidden rounded-lg border border-border bg-secondary">
                            <img
                              src={brandForm.heroImageUrl}
                              alt="Hero preview"
                              className="h-40 w-full object-cover"
                            />
                            <div
                              className="absolute inset-0"
                              style={{
                                backgroundColor: "rgba(0,0,0,1)",
                                opacity: Math.min(0.9, Math.max(0, (Number(brandForm.heroOverlayOpacity || 0) || 0) / 100)),
                              }}
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Optional — empty hero falls back to a simple gradient.
                          </p>
                        )}
                      </div>
                      <div className="mt-3">
                        <label className="mb-2 block text-sm font-semibold text-foreground">
                          Overlay ({Number(brandForm.heroOverlayOpacity || 0) || 0}%)
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          step="1"
                          value={Number(brandForm.heroOverlayOpacity || 0) || 0}
                          onChange={(e) => setBrandForm((p) => ({ ...p, heroOverlayOpacity: Number(e.target.value) }))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
                      Contact <span className="text-sm font-normal text-muted-foreground">(required to publish)</span>
                    </h2>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Saved to your resort branding in Firebase — hindi template defaults.
                    </p>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">Address</label>
                      <input
                        type="text"
                        value={brandForm.address || ""}
                        onChange={handleBrandFieldChange("address")}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Your street, city, province"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">Phone</label>
                      <input
                        type="tel"
                        value={brandForm.phone || ""}
                        onChange={handleBrandFieldChange("phone")}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="+63 …"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">Email</label>
                      <input
                        type="email"
                        value={brandForm.email || ""}
                        onChange={handleBrandFieldChange("email")}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="frontdesk@yourresort.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
                      Social media <span className="text-sm font-normal text-muted-foreground">(optional)</span>
                    </h2>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">Facebook</label>
                      <input
                        type="url"
                        value={brandForm.facebook || ""}
                        onChange={handleBrandFieldChange("facebook")}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="https://facebook.com/…"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">X (Twitter)</label>
                      <input
                        type="url"
                        value={brandForm.twitter || ""}
                        onChange={handleBrandFieldChange("twitter")}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="https://x.com/…"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">LinkedIn</label>
                      <input
                        type="url"
                        value={brandForm.linkedin || ""}
                        onChange={handleBrandFieldChange("linkedin")}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="https://linkedin.com/…"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">About</h2>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">About paragraph</label>
                      <textarea
                        value={brandForm.aboutBody || ""}
                        onChange={handleBrandFieldChange("aboutBody")}
                        rows={4}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Write a short description about your resort..."
                      />
                      <p className="mt-2 text-xs text-muted-foreground">This appears on the public landing page under About.</p>
                    </div>

                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-foreground">About highlights (3 cards)</div>
                      {[0, 1, 2].map((idx) => {
                        const item = (brandForm.aboutHighlights || [])[idx] || { title: "", desc: "" }
                        return (
                          <div key={idx} className="rounded-lg border border-border bg-background p-4 space-y-3">
                            <div className="text-xs font-semibold text-muted-foreground">Card {idx + 1}</div>
                            <input
                              type="text"
                              value={item.title || ""}
                              onChange={(e) =>
                                setBrandForm((p) => {
                                  const next = Array.isArray(p.aboutHighlights) ? [...p.aboutHighlights] : []
                                  while (next.length < 3) next.push({ title: "", desc: "" })
                                  next[idx] = { ...next[idx], title: e.target.value }
                                  return { ...p, aboutHighlights: next }
                                })
                              }
                              className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="Card title"
                            />
                            <textarea
                              value={item.desc || ""}
                              onChange={(e) =>
                                setBrandForm((p) => {
                                  const next = Array.isArray(p.aboutHighlights) ? [...p.aboutHighlights] : []
                                  while (next.length < 3) next.push({ title: "", desc: "" })
                                  next[idx] = { ...next[idx], desc: e.target.value }
                                  return { ...p, aboutHighlights: next }
                                })
                              }
                              rows={3}
                              className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="Description"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {!isLegacyHelpdesk && tenantOwnerUid && (
                    <div className="space-y-4 pt-4 border-t border-border">
                      <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">Marketplace listing</h2>

                      <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                        <p className="font-semibold text-foreground">Publish</p>
                        <ul className="mt-2 space-y-1 text-xs">
                          <li>Owner account approved • Listing approved by admin</li>
                          <li>
                            Need: contact above + at least one room (
                            <strong>Manage Rooms</strong>). Save marketplace fields below.
                          </li>
                        </ul>
                        <p className="mt-3 text-xs">
                          Status:{" "}
                          <span className="font-semibold text-foreground">
                            Owner {ownerApproved ? "Approved" : "Not approved"} • Listing{" "}
                            {String(listingForm.resortStatus || "").trim() || "—"} •{" "}
                            {listingForm.published ? "Published" : "Not published"}
                          </span>
                        </p>
                      </div>

                      {publishMissing.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          Complete the following to publish: <strong>{publishMissing.join(", ")}</strong>
                        </div>
                      )}

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-foreground">Location</label>
                        <input
                          type="text"
                          value={listingForm.location || ""}
                          onChange={(e) => setListingForm((p) => ({ ...p, location: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="e.g. San Juan, La Union"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-foreground">Google Maps link</label>
                        <input
                          type="url"
                          value={listingForm.mapsUrl || ""}
                          onChange={(e) => setListingForm((p) => ({ ...p, mapsUrl: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="https://maps.app.goo.gl/…"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-foreground">Description</label>
                        <textarea
                          value={listingForm.description || ""}
                          onChange={(e) => setListingForm((p) => ({ ...p, description: e.target.value }))}
                          rows={4}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Short description shown on Marketplace."
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-foreground">Category</label>
                          <input
                            type="text"
                            value={listingForm.category || ""}
                            onChange={(e) => setListingForm((p) => ({ ...p, category: e.target.value }))}
                            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Resort"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-foreground">Tags (comma separated)</label>
                          <input
                            type="text"
                            value={listingForm.tags || ""}
                            onChange={(e) => setListingForm((p) => ({ ...p, tags: e.target.value }))}
                            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Beachfront, Family, Pool"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-foreground">Listing image URL (optional)</label>
                        <input
                          type="url"
                          value={listingForm.listingImage || ""}
                          onChange={(e) => setListingForm((p) => ({ ...p, listingImage: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="https://…/hero.jpg"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          Leave empty to use the default placeholder image on Marketplace.
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row pt-2">
                        <button
                          type="button"
                          onClick={handleListingSave}
                          disabled={listingSaving || listingLoading}
                          className="flex-1 rounded-lg border border-border py-2 font-semibold text-foreground transition hover:bg-secondary disabled:opacity-60"
                        >
                          {listingSaving ? "Saving…" : "Save marketplace listing"}
                        </button>
                        <button
                          type="button"
                          onClick={handlePublish}
                          disabled={!canPublish || publishing}
                          className="flex-1 rounded-lg bg-emerald-700 py-2 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                        >
                          {publishing ? "Publishing…" : listingForm.published ? "Published" : "Publish"}
                        </button>
                      </div>
                      {listingForm.published && listingPreviewUrl ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Public booking site preview: </span>
                          <a
                            href={listingPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all font-mono text-xs text-primary underline underline-offset-2"
                          >
                            {listingPreviewUrl}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 pt-4 border-t border-border">
                    <button
                      type="submit"
                      disabled={brandSaving}
                      className="w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 sm:max-w-md"
                    >
                      {brandSaving ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/60 border-t-primary-foreground" />
                          Saving…
                        </span>
                      ) : (
                        "Save changes"
                      )}
                    </button>
                  </div>
                  {brandSaved && (
                    <p className="text-sm font-semibold text-primary">Branding saved! Refresh the public site to verify.</p>
                  )}
                </form>
                <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-lg">
                  <p className="text-xs uppercase tracking-[0.35em] text-primary-foreground/80">Preview</p>
                  <div className="mt-6 flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary-foreground/40 bg-primary-foreground/10">
                      {brandForm.logo ? (
                        <img
                          src={brandForm.logo}
                          alt="Brand preview"
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          aria-label="Brand preview"
                          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-sm font-bold uppercase text-white"
                        >
                          {getInitials(brandForm.name)}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-2xl font-semibold tracking-tight">
                        {brandForm.name || "Your resort name"}
                      </p>
                      {brandForm.tagline ? (
                        <p className="text-sm text-primary-foreground/85">{brandForm.tagline}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-6 rounded-lg bg-primary-foreground/10 p-4 text-sm text-primary-foreground/85">
                    Changes save to Firebase and apply on your public booking link after refresh.
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentPage === "payment-integration" && (
            <PaymentIntegrationSettings
              tenantOwnerUid={tenantOwnerUid}
              isLegacyHelpdesk={isLegacyHelpdesk}
            />
          )}
        </div>
      </main>
    </div>
    
    {/* Logout Confirmation Modal */}
    <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
      <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-bold text-gray-900">
            Confirm Logout
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-600 pt-2">
            Are you sure you want to logout? You will need to sign in again to access the admin panel.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
          <AlertDialogCancel className="w-full sm:w-auto order-2 sm:order-1">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmLogout}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white order-1 sm:order-2"
          >
            Logout
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    <AddRoomModal
      open={addRoomOpen}
      onClose={() => setAddRoomOpen(false)}
      onSave={handleRoomSave}
      duplicateScopeOwnerUid={tenantOwnerUid}
    />
    <PreviewRoomModal
      open={previewOpen}
      room={previewRoom}
      onClose={() => {
        setPreviewOpen(false)
        setPreviewRoom(null)
      }}
      onSave={handleRoomUpdate}
    />

    {/* Hero crop modal */}
    <Dialog
      open={heroCropOpen}
      onOpenChange={(open) => {
        if (!open && heroUploading) return
        setHeroCropOpen(open)
      }}
    >
      <DialogContent
        className={isMobile ? "max-w-[95%] w-[95%] p-4" : "max-w-3xl p-6"}
        showCloseButton={!heroUploading}
        onInteractOutside={(e) => {
          if (heroUploading) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (heroUploading) e.preventDefault()
        }}
      >
        <DialogHeader className={isMobile ? "pb-2" : "pb-4"}>
          <DialogTitle className={`${isMobile ? "text-lg" : "text-xl"} font-bold text-foreground`}>
            Crop hero image
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Crop to 16:9 so it looks good on desktop and mobile.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`relative w-full overflow-hidden rounded-lg border border-border bg-black ${heroUploading ? "pointer-events-none opacity-90" : ""}`}
          style={{ height: isMobile ? 260 : 420 }}
        >
          {heroCropSrc && (
            <Cropper
              image={heroCropSrc}
              crop={heroCrop}
              zoom={heroZoom}
              aspect={16 / 9}
              onCropChange={setHeroCrop}
              onZoomChange={setHeroZoom}
              onCropComplete={(_, croppedAreaPixels) => setHeroCroppedPixels(croppedAreaPixels)}
            />
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Zoom</span>
            <span>{heroZoom.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={heroZoom}
            onChange={(e) => setHeroZoom(Number(e.target.value))}
            className="w-full"
            disabled={heroUploading}
          />
        </div>

        <DialogFooter className={isMobile ? "flex-col gap-2 mt-4" : "mt-6"}>
          <Button
            type="button"
            className={`${isMobile ? "w-full" : ""} bg-secondary text-secondary-foreground hover:bg-secondary/80`}
            onClick={() => setHeroCropOpen(false)}
            disabled={heroUploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={`${isMobile ? "w-full" : ""} bg-emerald-700 hover:bg-emerald-800 text-white`}
            onClick={handleHeroCropConfirm}
            disabled={heroUploading}
          >
            {heroUploading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading…
              </span>
            ) : (
              "Use this image"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  )
}

