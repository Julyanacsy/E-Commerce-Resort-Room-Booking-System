"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
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
  BellRing,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  History,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Paintbrush,
  Star,
  Search,
  Sun,
  Upload,
  Wallet,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { auth, db, googleProvider } from "@/lib/firebase"
import { getGoogleSignInErrorMessage, signInWithGoogle } from "@/lib/google-sign-in"
import { BRANDING_DEFAULTS, useBranding } from "@/hooks/use-branding"
import { useResortOwnerBranding } from "@/hooks/use-resort-owner-branding"
import { useMarketplaceSettings } from "@/hooks/use-marketplace-settings"
import { normalizeOwnerUidFromSearchParam } from "@/lib/booking-tenant"
import { resortAdminRequest } from "@/lib/admin-api-client"
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
import BookingHistory from "@/components/admin/pages/booking-history"
import ManageContact from "@/components/admin/pages/manage-contact"
import ManageFeedback from "@/components/admin/pages/manage-feedback"
import AdminOverview from "@/components/admin/pages/admin-overview"
import ManageRooms from "@/components/admin/pages/manage-rooms"
import PaymentSettings from "@/components/admin/payment-settings"
import BookingCalendar from "@/components/admin/booking-calendar"
import StaffManagement from "@/components/admin/staff-management"
import ReminderSettings from "@/components/admin/reminder-settings"
import AdminNotificationBell from "@/components/admin/admin-notification-bell"
import AuditLog from "@/components/admin/pages/audit-log"
import LostAndFound from "@/components/admin/pages/lost-and-found"
const ALLOWED_ADMINS = ["admin@luxestay.com", "resort.helpdesk01@gmail.com"]

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "manage-rooms", label: "Manage Rooms", icon: BedDouble },
  { key: "lost-and-found", label: "Lost and Found", icon: Search },
  { key: "manage-bookings", label: "Manage Bookings", icon: CalendarCheck },
  { key: "booking-calendar", label: "Booking Calendar", icon: CalendarDays },
  { key: "booking-history", label: "Booking History", icon: History },
  { key: "contact-messages", label: "Contact Messages", icon: MessageCircle },
  { key: "manage-feedback", label: "Manage Feedback", icon: Star },
  { key: "brand-settings", label: "Brand Settings", icon: Paintbrush },
  { key: "payment-integration", label: "Payments", icon: Wallet },
  { key: "reminder-settings", label: "Email Reminders", icon: BellRing },
  { key: "audit-log", label: "Audit Log", icon: ClipboardList },
  { key: "staff-management", label: "Staff Accounts", icon: Users },
]

/** Hero export: smaller file uploads faster; still sharp at typical viewport widths */
const HERO_EXPORT_W = 1280
const HERO_EXPORT_H = 720
const HERO_JPEG_QUALITY = 0.82
/** Firestore docs max ~1 MiB; hero shares the branding doc with logo/favicon text fields */
const MAX_HERO_DATA_URL_CHARS = 520_000

export default function AdminPage({ portalMode }) {
  const { branding: globalBranding, updateBranding: updateGlobalBranding } = useBranding()
  const { settings: marketplace } = useMarketplaceSettings()
  const isMobile = useIsMobile()
  const [currentPage, setCurrentPage] = useState("dashboard")
  const [adminUser, setAdminUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState("")
  const [authNotice, setAuthNotice] = useState("")
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [staffNotifications, setStaffNotifications] = useState([])
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
  const [busyRoomId, setBusyRoomId] = useState(null)
  const [loginOwnerUid, setLoginOwnerUid] = useState(null)
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
  const tenantOwnerUid = adminUser && !isLegacyHelpdesk
    ? adminUser.tenantOwnerUid || adminUser.uid
    : null
  const staffRole = adminUser?.staffRole || "owner"
  const staffNavKeys = {
    admin: ["manage-bookings", "booking-calendar", "booking-history", "payment-integration", "lost-and-found"],
    "front-desk": ["manage-bookings", "booking-calendar", "payment-integration", "lost-and-found"],
    finance: ["booking-history", "payment-integration"],
  }
  const visibleNavItems = isLegacyHelpdesk
    ? NAV_ITEMS.filter((item) => !["lost-and-found", "audit-log"].includes(item.key))
    : staffRole === "owner"
      ? NAV_ITEMS
      : NAV_ITEMS.filter((item) => staffNavKeys[staffRole]?.includes(item.key))
  const { branding: ownerBrandingSnapshot, updateBranding: updateOwnerBranding } =
    useResortOwnerBranding(tenantOwnerUid)
  const { branding: loginOwnerBranding } = useResortOwnerBranding(loginOwnerUid)

  const branding = tenantOwnerUid ? (ownerBrandingSnapshot ?? BRANDING_DEFAULTS) : globalBranding
  const updateBranding = tenantOwnerUid ? updateOwnerBranding : updateGlobalBranding

  useEffect(() => {
    if (!tenantOwnerUid || !adminUser?.uid || staffRole === "owner") {
      setStaffNotifications([])
      return undefined
    }

    const notificationsQuery = query(
      collection(db, "resortOwners", tenantOwnerUid, "staffNotifications"),
      where("staffUid", "==", adminUser.uid),
      limit(20),
    )
    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const notifications = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setStaffNotifications(notifications)
      },
      (error) => {
        console.error("Failed to load staff notifications:", error)
        toast.error("Staff notifications could not be loaded.")
      },
    )
  }, [tenantOwnerUid, adminUser?.uid, staffRole])

  const markStaffNotificationRead = async (notificationId) => {
    try {
      await updateDoc(
        doc(db, "resortOwners", tenantOwnerUid, "staffNotifications", notificationId),
        { read: true, readAt: new Date() },
      )
    } catch (error) {
      console.error("Failed to mark staff notification as read:", error)
      toast.error("Notification could not be marked as read.")
    }
  }

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

  const handleEmailPasswordLogin = async (event) => {
    event.preventDefault()
    if (!auth) {
      setAuthError("Email and password sign-in is not available right now.")
      return
    }
    setAuthSubmitting(true)
    setAuthError("")
    setAuthNotice("")
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword)
    } catch (error) {
      const expectedAuthFailure = [
        "auth/invalid-credential",
        "auth/wrong-password",
        "auth/user-not-found",
        "auth/invalid-email",
        "auth/too-many-requests",
        "auth/operation-not-allowed",
      ].includes(error?.code)
      if (!expectedAuthFailure) console.error("Email/password login failed", error)
      setAuthError(
        error?.code === "auth/invalid-credential"
          || error?.code === "auth/wrong-password"
          || error?.code === "auth/user-not-found"
          ? "Email or password is incorrect. New staff and Google-only users can set up a password below."
          : error?.code === "auth/too-many-requests"
            ? "Too many sign-in attempts. Please wait and try again."
            : error?.code === "auth/invalid-email"
              ? "Enter a valid email address."
            : error?.code === "auth/operation-not-allowed"
              ? "Email/password sign-in is disabled in Firebase Authentication. Ask the administrator to enable the Email/Password provider."
            : error?.message || "Email and password sign-in failed.",
      )
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handlePasswordReset = async () => {
    if (!auth || !loginEmail.trim()) {
      setAuthError("Enter your email address first to request a password setup or reset link.")
      return
    }
    setAuthSubmitting(true)
    setAuthError("")
    setAuthNotice("")
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim(), {
        url: `${window.location.origin}${portalMode === "staff" ? "/staff" : "/admin"}`,
        handleCodeInApp: false,
      })
      setAuthNotice("If an account exists for that email, a password setup link has been sent. Check your inbox and spam folder.")
    } catch (error) {
      const expectedAuthFailure = [
        "auth/invalid-email",
        "auth/too-many-requests",
        "auth/operation-not-allowed",
      ].includes(error?.code)
      if (!expectedAuthFailure) console.error("Password setup email failed", error)
      setAuthError(
        error?.code === "auth/operation-not-allowed"
          ? "Password setup is unavailable because Email/Password sign-in is disabled in Firebase Authentication."
          : error?.code === "auth/invalid-email"
            ? "Enter a valid email address."
            : error?.code === "auth/too-many-requests"
              ? "Too many requests. Please wait before requesting another password link."
              : error?.message || "A password setup email could not be sent.",
      )
    } finally {
      setAuthSubmitting(false)
    }
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
    if (!db || !tenantOwnerUid || isLegacyHelpdesk || !adminUser?.isResortOwner) {
      setOwnerApproved(false)
      return undefined
    }
    return onSnapshot(doc(db, "resortOwners", tenantOwnerUid), (snap) => {
      const st = String(snap.data()?.status || "").trim().toLowerCase()
      setOwnerApproved(st === "approved")
    })
  }, [tenantOwnerUid, isLegacyHelpdesk, adminUser?.isResortOwner])

  useEffect(() => {
    if (!db || !tenantOwnerUid || isLegacyHelpdesk || !adminUser?.isResortOwner) return undefined
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
          // Only merge listing identity — never write global BayRest defaults into Firestore.
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
  }, [tenantOwnerUid, isLegacyHelpdesk, adminUser?.isResortOwner, ownerBrandingSnapshot, updateOwnerBranding])

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
          if (portalMode === "staff") {
            setAdminUser(null)
            setAuthError("")
            setAccessMessage("This is an admin account. Use the Admin sign-in page at /admin.")
            setAuthLoading(false)
            return
          }
          setAdminUser({ ...firebaseUser, staffRole: "legacy", tenantOwnerUid: null })
          setAuthError("")
          setAccessMessage("")
          setAuthLoading(false)
          return
        }

        const resolveStaffAccess = async () => {
          const response = await fetch("/api/booking/admin-session", {
            headers: { Authorization: `Bearer ${await firebaseUser.getIdToken()}` },
            cache: "no-store",
          })
          const result = await response.json().catch(() => ({}))
          if (!response.ok) {
            if (response.status === 403 && result.error) {
              setAdminUser(null)
              setAccessMessage(
                portalMode === "staff"
                  ? "No approved staff access was found for this account. Ask your resort admin to add and approve you."
                  : result.error,
              )
              setAuthLoading(false)
              return "blocked"
            }
            return false
          }
          if (result.isOwner) {
            if (portalMode === "staff") {
              setAdminUser(null)
              setAuthError("")
              setAccessMessage("This is a resort admin account. Use the Admin sign-in page at /admin.")
              setAuthLoading(false)
              return "blocked"
            }
            return false
          }
          if (!result.ownerUid) return false
          if (portalMode === "admin") {
            setAdminUser(null)
            setAuthError("")
            setAccessMessage("This is a staff account. Use the Staff sign-in page at /staff.")
            setAuthLoading(false)
            return "blocked"
          }
          setAdminUser({
            ...firebaseUser,
            tenantOwnerUid: result.ownerUid,
            staffRole: result.role,
            isResortOwner: false,
          })
          setCurrentPage(result.role === "finance" ? "payment-integration" : "manage-bookings")
          setAuthError("")
          setAccessMessage("")
          setAuthLoading(false)
          return true
        }

        try {
          const ownerSnap = await getDoc(doc(db, "resortOwners", firebaseUser.uid))

          if (!ownerSnap.exists()) {
            const staffAccess = await resolveStaffAccess()
            if (staffAccess) return
            setAdminUser(null)
            setAuthError("")
            setAccessMessage(
              "This Google account has no approved resort access or active staff invitation. Resort owners can register on the Marketplace; staff should ask their resort owner to invite this email address.",
            )
            setAuthLoading(false)
            return
          }

          if (portalMode === "staff") {
            setAdminUser(null)
            setAuthError("")
            setAccessMessage("Resort admin accounts must sign in through /admin. This page is for assigned staff.")
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

          setAdminUser({
            ...firebaseUser,
            tenantOwnerUid: firebaseUser.uid,
            staffRole: "owner",
            isResortOwner: true,
          })
          setAuthError("")
          setAccessMessage("")
          setAuthLoading(false)
        } catch (error) {
          try {
            if (await resolveStaffAccess()) return
          } catch (staffError) {
            console.error("Failed to verify staff access", staffError)
          }
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
  }, [portalMode])

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
    if (!db || !adminUser || (!isLegacyHelpdesk && !adminUser.isResortOwner)) {
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
            .filter((r) => !r.ownerUid || r.ownerUid === adminUser.uid)
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
  }, [adminUser, isLegacyHelpdesk])

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
    if (!auth || !googleProvider) {
      setAuthError("Google sign-in is not available right now.")
      return
    }
    setAuthSubmitting(true)
    setAuthError("")
    try {
      const { redirected } = await signInWithGoogle(auth, googleProvider)
      if (redirected) setAuthError("Popup blocked. Redirecting to Google sign-in…")
    } catch (error) {
      console.error("Google login failed", error)
      setAuthError(getGoogleSignInErrorMessage(error))
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
      await resortAdminRequest("/api/resort/rooms", {
        action: "room.create",
        room: {
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
          mapsUrl: payload.mapsUrl || "",
        },
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
      await resortAdminRequest("/api/resort/rooms", {
        action: "room.update",
        roomId,
        room: {
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
          mapsUrl: payload.mapsUrl || "",
        },
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

  const handleRoomArchiveAction = async (roomId, action) => {
    if (!roomId) return
    setBusyRoomId(roomId)
    try {
      await resortAdminRequest("/api/resort/rooms", { action, roomId })
      toast.success(action === "room.archive" ? "Room archived successfully." : "Room restored successfully.")
    } catch (error) {
      console.error("Failed to update room archive status", error)
      toast.error(error.message || "Room status could not be updated.")
    } finally {
      setBusyRoomId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-slate-50 to-white">
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
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-linear-to-b from-slate-50 to-white">
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
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {portalMode === "staff" ? "Staff sign in" : "Admin sign in"}
            </h2>
            <p className="mb-6 text-sm text-gray-600">
              {portalMode === "staff"
                ? "For staff approved by a resort admin. Your access is limited to your assigned resort and role."
                : "For resort owners and internal administrators."}
            </p>

            {authError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{authError}</div>}
            {authNotice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{authNotice}</div>}
            {accessMessage && <div className="mb-4 p-4 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200">{accessMessage}</div>}

            {portalMode === "staff" ? (
            <div>
            <form onSubmit={handleEmailPasswordLogin} className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Password
                <span className="relative mt-1 block">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((visible) => !visible)}
                    aria-label={showLoginPassword ? "Hide password" : "Show password"}
                    aria-pressed={showLoginPassword}
                    title={showLoginPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-gray-500 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
                  >
                    {showLoginPassword
                      ? <EyeOff size={18} aria-hidden="true" />
                      : <Eye size={18} aria-hidden="true" />}
                  </button>
                </span>
              </label>
              <button type="submit" disabled={authSubmitting} className="w-full rounded-lg bg-emerald-700 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70">
                {authSubmitting ? "Signing in…" : "Sign in with email"}
              </button>
            </form>

            <button type="button" onClick={handlePasswordReset} disabled={authSubmitting} className="mt-3 w-full text-sm font-semibold text-emerald-700 underline disabled:opacity-60">
              {authSubmitting ? "Sending…" : "Set up or reset password"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              <span>OR</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>
            </div>
            ) : null}

            <button
              type="button"
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
              {portalMode === "staff"
                ? "Only approved resort staff can access the staff portal."
                : "Approved resort owners and internal admins can access the admin portal."}
            </p>
            <p className="mt-3 text-center text-sm text-gray-600">
              {portalMode === "staff" ? (
                <>Resort admin? <a className="font-semibold text-emerald-700 underline" href="/admin">Go to Admin sign in</a></>
              ) : (
                <>Staff member? <a className="font-semibold text-emerald-700 underline" href="/staff">Go to Staff sign in</a></>
              )}
            </p>
            {accessMessage.includes("no approved resort access") && (
              <p className="mt-3 text-center text-sm text-gray-600">
                <a className="font-semibold text-emerald-700 underline" href="/resorts">
                  Register your resort on the Marketplace
                </a>
              </p>
            )}
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
        ? "bg-linear-to-b from-slate-900 to-slate-800"
        : "bg-linear-to-b from-slate-50 to-white"
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
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-600 bg-white/10">
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
            {visibleNavItems.map(({ key, label, icon: Icon }) => {
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
                  <Icon size={18} className="shrink-0" />
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
              <p className="font-semibold whitespace-nowrap">Administrator</p>
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
                <span className="shrink-0">
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
            {staffRole !== "owner" && staffNotifications.length > 0 ? (
              <section aria-label="Staff notifications" className="mb-6 space-y-3">
                {staffNotifications.filter((item) => item.read !== true).map((notification) => (
                  <article key={notification.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                    <div>
                      <h2 className="font-semibold">{notification.title || "Notification"}</h2>
                      <p className="mt-1 text-sm">{notification.message || ""}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => markStaffNotificationRead(notification.id)}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-100"
                    >
                      Mark read
                    </button>
                  </article>
                ))}
              </section>
            ) : null}
            {!isLegacyHelpdesk ? (
              <AdminNotificationBell
                onOpenAuditLog={staffRole === "owner" ? () => setCurrentPage("audit-log") : undefined}
                onOpenLostAndFound={
                  ["owner", "admin", "front-desk"].includes(staffRole)
                    ? () => setCurrentPage("lost-and-found")
                    : undefined
                }
              />
            ) : null}
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
            <AdminOverview
              isLegacyHelpdesk={isLegacyHelpdesk}
              ownerUid={tenantOwnerUid}
              rooms={rooms}
              roomsLoading={roomsLoading}
              roomsError={roomsError}
            />
          )}

          {currentPage === "manage-rooms" && (
            <ManageRooms
              rooms={rooms}
              loading={roomsLoading}
              error={roomsError}
              theme={theme}
              onAddRoom={() => setAddRoomOpen(true)}
              onPreviewRoom={(room) => {
                setPreviewRoom(room)
                setPreviewOpen(true)
              }}
              busyRoomId={busyRoomId}
              onArchiveRoom={(roomId) => handleRoomArchiveAction(roomId, "room.archive")}
              onRestoreRoom={(roomId) => handleRoomArchiveAction(roomId, "room.restore")}
              roomsPage={roomsPage}
              onPageChange={setRoomsPage}
            />
          )}

          {currentPage === "manage-bookings" && (
            <ManageBookings
              isLegacyHelpdesk={isLegacyHelpdesk}
              ownerUid={tenantOwnerUid}
              staffRole={staffRole}
              invoiceBusiness={{
                name: brandForm.name,
                address: brandForm.address,
                phone: brandForm.phone,
                email: brandForm.email,
              }}
            />
          )}

          {currentPage === "booking-history" && (
            <BookingHistory
              isLegacyHelpdesk={isLegacyHelpdesk}
              ownerUid={tenantOwnerUid}
              staffRole={staffRole}
              invoiceBusiness={{
                name: brandForm.name,
                address: brandForm.address,
                phone: brandForm.phone,
                email: brandForm.email,
              }}
            />
          )}

          {currentPage === "booking-calendar" && <BookingCalendar />}
          {currentPage === "lost-and-found"
            && !isLegacyHelpdesk
            && ["owner", "admin", "front-desk"].includes(staffRole)
            && <LostAndFound />}
          {currentPage === "audit-log" && staffRole === "owner" && !isLegacyHelpdesk && <AuditLog />}
          {currentPage === "reminder-settings" && staffRole === "owner" && (
            <ReminderSettings ownerUid={tenantOwnerUid} />
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
                <div className="rounded-xl border border-border bg-linear-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-lg">
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
            <PaymentSettings
              tenantOwnerUid={tenantOwnerUid}
              isLegacyHelpdesk={isLegacyHelpdesk}
              staffRole={staffRole}
            />
          )}

          {currentPage === "staff-management" && staffRole === "owner" && <StaffManagement />}
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
      existingRooms={rooms}
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
