"use client"

import { useEffect, useMemo, useState } from "react"
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { toast } from "sonner"
import { auth, googleProvider } from "@/lib/firebase"
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth"
import Link from "next/link"
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings,
  Sun,
  X,
} from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { getMapPreviewIframeSrc } from "@/lib/maps-preview-url"
import { appendSuperAdminAudit, SUPER_ADMIN_AUDIT_COLLECTION } from "@/lib/super-admin-audit"
import { ALLOWED_SUPER_ADMIN_EMAILS, isAllowedSuperAdminEmail } from "@/lib/allowed-super-admins"
import {
  MARKETPLACE_DEFAULTS,
  MARKETPLACE_DOC_ID,
  mergeMarketplaceFromFirestore,
} from "@/hooks/use-marketplace-settings"

const STATIC_ADMIN = {
  username: "superadmin",
  password: "superadmin123",
}

const NAV_ITEMS = [
  { key: "resorts", label: "Resorts", icon: LayoutDashboard },
  { key: "audit", label: "Audit log", icon: ScrollText },
  { key: "settings", label: "Settings", icon: Settings },
]

/** Same segments as the stat cards — filters which listings appear below. */
const RESORT_FILTER_TOTAL = "total"
const RESORT_FILTER_PENDING = "pending"
const RESORT_FILTER_APPROVED = "approved"
const RESORT_FILTER_REJECTED = "rejected"
const RESORT_FILTER_PUBLISHED = "published"

const RESORT_LIST_FILTER_OPTIONS = [
  { value: RESORT_FILTER_PENDING, label: "Pending" },
  { value: RESORT_FILTER_APPROVED, label: "Approved" },
  { value: RESORT_FILTER_REJECTED, label: "Rejected" },
  { value: RESORT_FILTER_PUBLISHED, label: "Published" },
  { value: RESORT_FILTER_TOTAL, label: "Total" },
]

function resortMatchesListFilter(r, filter) {
  const s = String(r?.status || "pending").toLowerCase()
  switch (filter) {
    case RESORT_FILTER_PENDING:
      return s === "pending"
    case RESORT_FILTER_APPROVED:
      return s === "approved"
    case RESORT_FILTER_REJECTED:
      return s === "rejected"
    case RESORT_FILTER_PUBLISHED:
      return s === "approved" && r.published === true
    default:
      return true
  }
}

function resortUpdatedAtMs(r) {
  const u = r?.updatedAt
  if (u && typeof u.toMillis === "function") return u.toMillis()
  if (u && typeof u.seconds === "number") return u.seconds * 1000
  return 0
}

function Badge({ children, tone = "neutral" }) {
  const cls =
    tone === "success"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800"
        : tone === "danger"
          ? "bg-red-50 text-red-700"
          : "bg-slate-100 text-slate-700"
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  )
}

/** Owner’s Google Maps URL — opens exact pin (modal preview is approximate). */
function MapsLinkActions({ mapsModalUrl }) {
  const url = String(mapsModalUrl || "").trim()
  if (!url) return null
  const btnBase =
    "inline-flex min-h-[40px] w-full items-center justify-center rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-wide transition sm:min-h-0 sm:w-auto sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.15em]"
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-start sm:gap-2">
      <button
        type="button"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        className={`${btnBase} bg-emerald-700 text-white hover:bg-emerald-600`}
      >
        Open in new tab
      </button>
      <button
        type="button"
        title="Opens the owner’s Google Maps link in this tab (you’ll leave this admin page)"
        onClick={() => {
          window.location.href = url
        }}
        className={`${btnBase} border border-emerald-200 bg-white text-emerald-900 hover:border-emerald-300 dark:border-slate-600 dark:bg-slate-800 dark:text-emerald-100`}
      >
        Google Maps (this tab)
      </button>
    </div>
  )
}

function ownerProfileInitials(displayName, email) {
  const n = String(displayName || "").trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }
  const e = String(email || "").trim()
  if (e) return e.slice(0, 2).toUpperCase()
  return "?"
}

/** resortOwners/{uid} — photo + Google name/email for super admin review */
function SuperAdminOwnerProfile({ resort, ownerDoc, ownerProfilesReady, theme }) {
  const ownerUid = String(resort?.ownerUid || resort?.id || "").trim()
  const fallbackEmail = String(resort?.ownerEmail || "").trim()
  const o = ownerDoc || {}
  const displayName = String(o.displayName || "").trim()
  const email = String(o.email || fallbackEmail || "").trim()
  const photoURL = String(o.photoURL || "").trim()
  const acctRaw = String(o.status || "").trim().toLowerCase()

  const primaryName = displayName || (email ? email.split("@")[0] : "Owner")
  const initials = ownerProfileInitials(displayName, email || fallbackEmail)

  const acctTone =
    acctRaw === "approved"
      ? "success"
      : acctRaw === "rejected"
        ? "danger"
        : acctRaw === "pending"
          ? "warn"
          : "neutral"

  const wrapBorder =
    theme === "dark" ? "border-slate-600/90 bg-slate-900/50" : "border-emerald-100 bg-white/80"
  const avatarBg =
    theme === "dark" ? "bg-slate-700 text-emerald-100" : "bg-emerald-100 text-emerald-900"

  const missingDoc = ownerProfilesReady && ownerUid && !ownerDoc

  return (
    <div className={`mt-3 flex gap-3 rounded-xl border p-3 ${wrapBorder}`}>
      <div className={`relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full ${avatarBg}`}>
        {photoURL ? (
          <img
            src={photoURL}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-bold">{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs font-semibold uppercase tracking-wide ${theme === "dark" ? "text-slate-500" : "text-emerald-700/70"}`}
        >
          Owner profile
        </p>
        <p className={`mt-0.5 truncate font-semibold ${theme === "dark" ? "text-white" : "text-emerald-900"}`}>
          {primaryName}
        </p>
        {email ? (
          <a
            href={`mailto:${email}`}
            className="mt-0.5 block truncate text-xs text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
          >
            {email}
          </a>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">No email on file</p>
        )}
        {ownerUid ? (
          <p className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground break-all" title={ownerUid}>
            UID: {ownerUid}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {acctRaw ? (
            <Badge tone={acctTone}>Owner account: {acctRaw}</Badge>
          ) : missingDoc ? (
            <Badge tone="warn">No resortOwners profile</Badge>
          ) : !ownerProfilesReady ? (
            <Badge>Loading owner…</Badge>
          ) : (
            <Badge tone="neutral">Owner account: —</Badge>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SuperAdminPage() {
  const [authed, setAuthed] = useState(false)
  const [login, setLogin] = useState({ username: "", password: "" })
  const [resorts, setResorts] = useState([])
  const [loading, setLoading] = useState(true)
  const [fireAuthUser, setFireAuthUser] = useState(null)
  const [fireAuthError, setFireAuthError] = useState("")
  const [mapsModalOpen, setMapsModalOpen] = useState(false)
  const [mapsModalUrl, setMapsModalUrl] = useState("")
  const [mapsPreviewSrc, setMapsPreviewSrc] = useState(null)
  const [mapsPreviewProvider, setMapsPreviewProvider] = useState(null)
  const [mapsPreviewLoading, setMapsPreviewLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState("resorts")
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState(false)
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("super-admin-theme")
      return saved === "dark" || saved === "light" ? saved : "light"
    }
    return "light"
  })
  const [appOrigin, setAppOrigin] = useState("")
  /** Approve / reject confirmation */
  const [resortActionModal, setResortActionModal] = useState(null)
  const [rejectReasonDraft, setRejectReasonDraft] = useState("")
  const [resortActionBusy, setResortActionBusy] = useState(false)
  const [mpForm, setMpForm] = useState(MARKETPLACE_DEFAULTS)
  const [mpSaving, setMpSaving] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [resortListFilter, setResortListFilter] = useState(RESORT_FILTER_TOTAL)
  const [ownerByUid, setOwnerByUid] = useState({})
  const [ownerProfilesReady, setOwnerProfilesReady] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") root.classList.add("dark")
    else root.classList.remove("dark")
    localStorage.setItem("super-admin-theme", theme)
  }, [theme])

  useEffect(() => {
    if (typeof window !== "undefined") setAppOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!mapsModalOpen || !mapsModalUrl.trim()) {
      setMapsPreviewSrc(null)
      setMapsPreviewProvider(null)
      setMapsPreviewLoading(false)
      return
    }

    const trimmed = mapsModalUrl.trim()
    const directPreview = getMapPreviewIframeSrc(trimmed)
    if (directPreview) {
      setMapsPreviewSrc(directPreview.src)
      setMapsPreviewProvider(directPreview.provider)
      setMapsPreviewLoading(false)
      return
    }

    const isShort =
      trimmed.includes("maps.app.goo.gl") || trimmed.includes("goo.gl/maps")
    if (!isShort) {
      setMapsPreviewSrc(null)
      setMapsPreviewProvider(null)
      setMapsPreviewLoading(false)
      return
    }

    let cancelled = false
    setMapsPreviewLoading(true)
    setMapsPreviewSrc(null)
    setMapsPreviewProvider(null)

    fetch(`/api/maps/resolve-short-link?url=${encodeURIComponent(trimmed)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || "Resolve failed")
        return data.url
      })
      .then((resolved) => {
        if (cancelled || !resolved) return
        const preview = getMapPreviewIframeSrc(resolved)
        if (preview) {
          setMapsPreviewSrc(preview.src)
          setMapsPreviewProvider(preview.provider)
        } else {
          setMapsPreviewSrc(null)
          setMapsPreviewProvider(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMapsPreviewSrc(null)
          setMapsPreviewProvider(null)
        }
      })
      .finally(() => {
        if (!cancelled) setMapsPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mapsModalOpen, mapsModalUrl])

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
    if (typeof window === "undefined") return
    const saved = localStorage.getItem("superAdminAuthed")
    setAuthed(saved === "true")
  }, [])

  useEffect(() => {
    if (!authed || !auth) return

    const unsub = onAuthStateChanged(auth, (user) => {
      setFireAuthUser(user)
    })
    return () => unsub()
  }, [authed])

  useEffect(() => {
    if (!authed) return
    if (!fireAuthUser) return

    const resortsQuery = query(collection(db, "resorts"), orderBy("updatedAt", "desc"))

    const unsubResorts = onSnapshot(
      resortsQuery,
      (snap) => {
        setResorts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        console.error("Failed to load resorts", err)
        setFireAuthError(err?.code || err?.message || "Failed to load resorts")
        toast.error("Super Admin cannot read resorts. Check Firestore rules.")
        setLoading(false)
      },
    )

    return () => {
      unsubResorts()
    }
  }, [authed, fireAuthUser])

  useEffect(() => {
    if (!db || !authed || !fireAuthUser?.email) return
    if (!isAllowedSuperAdminEmail(fireAuthUser.email)) return

    const ref = doc(db, "settings", MARKETPLACE_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setMpForm(mergeMarketplaceFromFirestore(snap.data()))
        } else {
          setMpForm(mergeMarketplaceFromFirestore({}))
        }
      },
      (err) => {
        console.error("Marketplace settings listen failed", err)
      },
    )
    return () => unsub()
  }, [authed, fireAuthUser])

  useEffect(() => {
    if (!db || !authed || !fireAuthUser?.email) return
    if (!isAllowedSuperAdminEmail(fireAuthUser.email)) return

    setAuditLoading(true)
    const auditQuery = query(
      collection(db, SUPER_ADMIN_AUDIT_COLLECTION),
      orderBy("createdAt", "desc"),
      limit(150),
    )
    const unsub = onSnapshot(
      auditQuery,
      (snap) => {
        setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setAuditLoading(false)
      },
      (err) => {
        console.error("Audit log listen failed", err)
        setAuditLoading(false)
        toast.error("Could not load audit log.")
      },
    )
    return () => unsub()
  }, [authed, fireAuthUser])

  useEffect(() => {
    if (!db || !authed || !fireAuthUser?.email) return
    if (!isAllowedSuperAdminEmail(fireAuthUser.email)) return

    const unsub = onSnapshot(
      collection(db, "resortOwners"),
      (snap) => {
        const next = {}
        snap.docs.forEach((d) => {
          next[d.id] = d.data()
        })
        setOwnerByUid(next)
        setOwnerProfilesReady(true)
      },
      (err) => {
        console.error("resortOwners listen failed", err)
        setOwnerProfilesReady(true)
      },
    )
    return () => unsub()
  }, [authed, fireAuthUser])

  const resortStats = useMemo(() => {
    let pending = 0
    let approved = 0
    let rejected = 0
    let published = 0
    for (const r of resorts) {
      const s = String(r.status || "pending").toLowerCase()
      if (s === "pending") pending += 1
      else if (s === "approved") approved += 1
      else if (s === "rejected") rejected += 1
      if (s === "approved" && r.published === true) published += 1
    }
    return {
      pending,
      approved,
      rejected,
      published,
      total: resorts.length,
    }
  }, [resorts])

  const filteredResorts = useMemo(() => {
    const list = resorts.filter((r) => resortMatchesListFilter(r, resortListFilter))
    list.sort((a, b) => resortUpdatedAtMs(b) - resortUpdatedAtMs(a))
    return list
  }, [resorts, resortListFilter])

  const handleLogin = (e) => {
    e.preventDefault()
    if (login.username === STATIC_ADMIN.username && login.password === STATIC_ADMIN.password) {
      setAuthed(true)
      if (typeof window !== "undefined") localStorage.setItem("superAdminAuthed", "true")
      toast.success("Welcome, Super Admin.")
      return
    }
    toast.error("Invalid credentials.")
  }

  const handleLogout = () => {
    setAuthed(false)
    setCurrentPage("resorts")
    if (typeof window !== "undefined") localStorage.removeItem("superAdminAuthed")
    if (auth) {
      signOut(auth).catch(() => {})
    }
  }

  const handleSaveMarketplace = async () => {
    if (!db || !fireAuthUser?.email || !isAllowedSuperAdminEmail(fireAuthUser.email)) {
      toast.error("You must be signed in as an authorized super admin to save.")
      return
    }
    setMpSaving(true)
    try {
      await setDoc(
        doc(db, "settings", MARKETPLACE_DOC_ID),
        { ...mpForm, updatedAt: serverTimestamp() },
        { merge: true },
      )
      toast.success("Marketplace page copy saved.")
    } catch (e) {
      console.error(e)
      toast.error("Failed to save marketplace settings. Check Firestore rules (super admin only).")
    } finally {
      setMpSaving(false)
    }
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }

  const notifyOwnerByEmail = async ({ type, to, resortName, reason }) => {
    const email = String(to || "").trim().toLowerCase()
    if (!email) {
      toast.warning(
        "Walang owner email sa listing na ito — hindi makapagpadala ng approve/reject email. Ilagay ang owner email sa resort record (ownerEmail) o i-notify manual.",
        { duration: 8000 },
      )
      return
    }
    let idToken = ""
    try {
      if (auth?.currentUser) idToken = await auth.currentUser.getIdToken(true)
    } catch {
      idToken = ""
    }
    try {
      const res = await fetch("/api/resort/notify-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          to: email,
          resortName,
          reason: reason || "",
          idToken,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 503 && data.skipped) {
        toast.warning(data.hint || "Hindi na-configure ang email sa server.", {
          duration: 10000,
          description: data.skipReason ? `Code: ${data.skipReason}` : undefined,
        })
        return
      }
      if (!res.ok) {
        const title = data.error || "Could not send email to the owner."
        const desc = data.hint || (data.mailSource ? `Credential source: ${data.mailSource}` : undefined)
        toast.warning(title, desc ? { description: desc } : undefined)
        return
      }
      toast.success("Owner notified by email.")
    } catch (e) {
      console.error("notify email failed", e)
      toast.warning("Could not send email notification.")
    }
  }

  const handleGoogleConnect = async () => {
    if (!auth || !googleProvider) {
      toast.error("Google sign-in is not available right now.")
      return
    }
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const email = (result.user?.email || "").toLowerCase()
      if (!isAllowedSuperAdminEmail(email)) {
        setFireAuthError("This Google account is not authorized for Super Admin access.")
        toast.error("Not authorized for Super Admin.")
        await signOut(auth)
        return
      }
      setFireAuthError("")
    } catch (err) {
      console.error("Super admin Google sign-in failed", err)
      toast.error("Google sign-in failed.")
    }
  }

  const openResortActionModal = (resort, kind) => {
    setRejectReasonDraft("")
    setResortActionModal({ kind, resort })
  }

  const closeResortActionModal = () => {
    if (resortActionBusy) return
    setResortActionModal(null)
    setRejectReasonDraft("")
  }

  const confirmResortActionModal = async () => {
    if (!resortActionModal || resortActionBusy) return
    const { kind, resort } = resortActionModal
    const resortId = resort.id
    const ownerUid = resort?.ownerUid || resortId

    if (kind === "reject") {
      const trimmed = rejectReasonDraft.trim()
      if (!trimmed) {
        toast.error("Please enter a reason for rejection.")
        return
      }
      setResortActionBusy(true)
      try {
        await updateDoc(doc(db, "resorts", resortId), {
          status: "rejected",
          rejectionReason: trimmed,
          rejectedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        await updateDoc(doc(db, "resortOwners", ownerUid), {
          status: "rejected",
          rejectionReason: trimmed,
          rejectedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        try {
          await appendSuperAdminAudit(db, {
            action: "reject",
            resortId,
            resortName: resort?.name || "",
            ownerUid,
            previousStatus: String(resort?.status || "pending").toLowerCase(),
            newStatus: "rejected",
            reason: trimmed,
            actorEmail: fireAuthUser?.email || "",
            actorUid: fireAuthUser?.uid || "",
          })
        } catch (auditErr) {
          console.error("Audit log failed", auditErr)
        }
        toast.success("Resort rejected.")
        setResortActionModal(null)
        setRejectReasonDraft("")
        await notifyOwnerByEmail({
          type: "rejected",
          to: resort?.ownerEmail,
          resortName: resort?.name || "Your resort",
          reason: trimmed,
        })
      } catch (err) {
        console.error("Failed updating resort status", err)
        toast.error("Failed to update resort.")
      } finally {
        setResortActionBusy(false)
      }
      return
    }

    setResortActionBusy(true)
    try {
      await updateDoc(doc(db, "resorts", resortId), {
        status: "approved",
        rejectionReason: "",
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await updateDoc(doc(db, "resortOwners", ownerUid), {
        status: "approved",
        rejectionReason: "",
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      try {
        await appendSuperAdminAudit(db, {
          action: "approve",
          resortId,
          resortName: resort?.name || "",
          ownerUid,
          previousStatus: String(resort?.status || "pending").toLowerCase(),
          newStatus: "approved",
          actorEmail: fireAuthUser?.email || "",
          actorUid: fireAuthUser?.uid || "",
        })
      } catch (auditErr) {
        console.error("Audit log failed", auditErr)
      }
      toast.success("Resort approved.")
      setResortActionModal(null)
      setRejectReasonDraft("")
      await notifyOwnerByEmail({
        type: "approved",
        to: resort?.ownerEmail,
        resortName: resort?.name || "Your resort",
      })
    } catch (err) {
      console.error("Failed updating resort status", err)
      toast.error("Failed to update resort.")
    } finally {
      setResortActionBusy(false)
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[oklch(0.98_0.01_70)] to-white px-4 py-14">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-7 shadow-lg">
          <p className="text-xs font-semibold tracking-[0.35em] uppercase text-emerald-700/70">
            Super Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold text-emerald-900">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Static credentials for now (we’ll secure this later).
          </p>

          <form onSubmit={handleLogin} className="mt-6 grid gap-4">
            <div>
              <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
                Username
              </label>
              <input
                value={login.username}
                onChange={(e) => setLogin((p) => ({ ...p, username: e.target.value }))}
                className="h-12 w-full rounded-xl border border-emerald-100 bg-background px-4 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
                placeholder="superadmin"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900">
                Password
              </label>
              <input
                value={login.password}
                onChange={(e) => setLogin((p) => ({ ...p, password: e.target.value }))}
                type="password"
                className="h-12 w-full rounded-xl border border-emerald-100 bg-background px-4 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
                placeholder="superadmin123"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-6 py-3 text-xs font-semibold tracking-[0.2em] uppercase text-white shadow-lg shadow-emerald-700/20 transition hover:-translate-y-0.5 hover:bg-emerald-600"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!fireAuthUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[oklch(0.98_0.01_70)] to-white px-4 py-14">
        <div className="mx-auto w-full max-w-lg rounded-2xl border border-emerald-100 bg-white p-7 shadow-lg">
          <p className="text-xs font-semibold tracking-[0.35em] uppercase text-emerald-700/70">
            Super Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold text-emerald-900">Connect Google</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Firestore reads are protected. Connect with Google so this dashboard can load resort accounts.
          </p>
          {fireAuthError && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {fireAuthError}
            </div>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleGoogleConnect}
              className="inline-flex flex-1 items-center justify-center rounded-full bg-emerald-700 px-6 py-3 text-xs font-semibold tracking-[0.2em] uppercase text-white shadow-lg shadow-emerald-700/20 transition hover:-translate-y-0.5 hover:bg-emerald-600"
            >
              Continue with Google
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-emerald-100 bg-white px-6 py-3 text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200"
            >
              Back
            </button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Note: we’ll later enforce that only approved super admins can connect.
          </p>
        </div>
      </div>
    )
  }

  const isAllowedSuperAdmin = isAllowedSuperAdminEmail(fireAuthUser?.email || "")
  if (!isAllowedSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[oklch(0.98_0.01_70)] to-white px-4 py-14">
        <div className="mx-auto w-full max-w-lg rounded-2xl border border-emerald-100 bg-white p-7 shadow-lg">
          <p className="text-xs font-semibold tracking-[0.35em] uppercase text-emerald-700/70">
            Super Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold text-emerald-900">Not authorized</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as <span className="font-semibold">{fireAuthUser.email || "unknown"}</span> — this account is not allowed.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut(auth)
                } catch {}
              }}
              className="inline-flex flex-1 items-center justify-center rounded-full bg-emerald-700 px-6 py-3 text-xs font-semibold tracking-[0.2em] uppercase text-white shadow-lg shadow-emerald-700/20 transition hover:-translate-y-0.5 hover:bg-emerald-600"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-emerald-100 bg-white px-6 py-3 text-xs font-semibold tracking-[0.2em] uppercase text-emerald-900 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const cardBase =
    theme === "dark"
      ? "rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-sm"
      : "rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm"
  const cardMuted =
    theme === "dark" ? "text-slate-400" : "text-emerald-700/70"
  const headingClass = theme === "dark" ? "text-white" : "text-emerald-900"
  const subText = theme === "dark" ? "text-slate-300" : "text-emerald-900"
  const listRow =
    theme === "dark"
      ? "rounded-xl border border-slate-600/80 bg-slate-800/80 p-4"
      : "rounded-xl border border-emerald-100/70 bg-white p-4"
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL || ""

  return (
    <>
      <Toaster position="top-center" richColors />
      <div
        className={`fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          mobileSidebarVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileSidebarVisible(false)}
      />
      <div
        className={`flex h-screen transition-colors duration-300 ${
          theme === "dark"
            ? "bg-gradient-to-b from-slate-900 to-slate-800"
            : "bg-gradient-to-b from-slate-50 to-white"
        }`}
      >
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-full flex-col shadow-2xl transition-all duration-300 ease-in-out lg:static lg:shadow-none ${
            theme === "dark"
              ? "border-r border-slate-700 bg-slate-800 text-white"
              : "border-r border-emerald-800 bg-emerald-900 text-white"
          } ${
            mobileSidebarVisible ? "w-64 translate-x-0" : "-translate-x-full w-64 lg:translate-x-0"
          } ${sidebarExpanded ? "lg:w-64" : "lg:w-20"}`}
        >
          <div
            className={`relative flex items-center gap-3 border-b py-6 transition-all duration-300 ${
              theme === "dark" ? "border-slate-700" : "border-emerald-800"
            } ${sidebarExpanded ? "px-5" : "px-3 lg:px-3"}`}
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-emerald-500/50 bg-white/10">
              <LayoutDashboard className="h-6 w-6 text-emerald-200" aria-hidden />
            </div>
            <div
              className={`overflow-hidden transition-all duration-300 ${
                mobileSidebarVisible || sidebarExpanded ? "max-w-full opacity-100" : "max-w-0 opacity-0 lg:max-w-0 lg:opacity-0"
              }`}
            >
              <p className="whitespace-nowrap text-lg font-bold tracking-[0.2em] uppercase">Super Admin</p>
              <p className="whitespace-nowrap text-[11px] text-emerald-200">Platform review</p>
              <p className="mt-1 truncate text-[10px] text-emerald-200/70">{fireAuthUser?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileSidebarVisible(false)}
              className="absolute right-4 top-6 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white transition-all duration-200 hover:bg-white/10 lg:hidden"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={() => setSidebarExpanded((prev) => !prev)}
              className="absolute -right-4 top-8 hidden h-9 w-9 items-center justify-center rounded-full border border-emerald-700 bg-emerald-900 text-white shadow-xl transition-all duration-200 hover:bg-emerald-800 lg:inline-flex"
            >
              {sidebarExpanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
            </button>
          </div>

          <nav
            className={`flex-1 space-y-2 px-3 py-5 transition-all duration-300 ${
              sidebarExpanded ? "overflow-y-auto" : "overflow-hidden lg:overflow-hidden"
            }`}
          >
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
              const isActive = currentPage === key
              return (
                <button
                  key={key}
                  type="button"
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
                      mobileSidebarVisible || sidebarExpanded ? "max-w-full opacity-100" : "max-w-0 opacity-0 lg:max-w-0 lg:opacity-0"
                    }`}
                  >
                    {label}
                  </span>
                  {!sidebarExpanded && (
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl transition-all duration-200 group-hover:opacity-100">
                      {label}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div
            className={`space-y-3 border-t py-5 transition-all duration-300 ${
              theme === "dark" ? "border-slate-700" : "border-emerald-800"
            } ${sidebarExpanded ? "px-5" : "px-3 lg:px-3"}`}
          >
            <div
              className={`overflow-hidden text-sm transition-all duration-300 ${
                mobileSidebarVisible || sidebarExpanded ? "max-w-full opacity-100" : "max-w-0 opacity-0 lg:max-w-0 lg:opacity-0"
              }`}
            >
              <p
                className={`whitespace-nowrap text-xs uppercase tracking-[0.25em] ${
                  theme === "dark" ? "text-slate-400" : "text-emerald-200"
                }`}
              >
                Signed in as
              </p>
              <p className="whitespace-nowrap font-semibold">{fireAuthUser?.displayName ?? "Super admin"}</p>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className={`relative flex w-full items-center justify-center gap-2 rounded-lg py-2 font-semibold transition-all duration-200 ${
                theme === "dark"
                  ? "bg-slate-700 text-white hover:bg-slate-600"
                  : "bg-emerald-800 text-white hover:bg-emerald-700"
              }`}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <span
                className={`transition-all duration-300 ${
                  mobileSidebarVisible || sidebarExpanded ? "max-w-full opacity-100" : "max-w-0 overflow-hidden opacity-0 lg:max-w-0 lg:opacity-0"
                }`}
              >
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </span>
              <span
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                  mobileSidebarVisible || sidebarExpanded ? "pointer-events-none opacity-0" : "opacity-100 lg:opacity-100"
                }`}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </span>
              {(mobileSidebarVisible || sidebarExpanded) && (
                <span className="flex-shrink-0">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="relative flex w-full items-center justify-center rounded-lg bg-red-600 py-2 font-semibold text-white transition-all duration-200 hover:bg-red-700"
            >
              <span
                className={`transition-all duration-300 ${
                  mobileSidebarVisible || sidebarExpanded ? "max-w-full opacity-100" : "max-w-0 overflow-hidden opacity-0 lg:max-w-0 lg:opacity-0"
                }`}
              >
                Sign out
              </span>
              {!(mobileSidebarVisible || sidebarExpanded) && (
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 lg:opacity-100">
                  <LogOut size={18} />
                </span>
              )}
            </button>
          </div>
        </aside>

        <main
          className={`flex-1 overflow-auto transition-colors duration-300 ${
            theme === "dark" ? "bg-slate-900" : "bg-background"
          }`}
        >
          <div className="mx-auto max-w-6xl p-6 lg:p-8">
            <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileSidebarVisible((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <Menu size={18} />
                Menu
              </button>
              <div className="flex items-center gap-3 rounded-full border border-emerald-100 bg-white/70 px-4 py-2 shadow-sm dark:border-slate-600 dark:bg-slate-800">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-900/90 text-white">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${theme === "dark" ? "text-white" : "text-emerald-900"}`}>
                    Super Admin
                  </p>
                  <p className="text-xs text-muted-foreground">Review listings</p>
                </div>
              </div>
            </div>

            {currentPage === "resorts" && (
              <>
                <div className="mb-8">
                  <h1 className={`text-3xl font-bold ${headingClass}`}>Resorts</h1>
                  <p className={`mt-1 text-sm ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                    Approve or reject resort submissions. Owners are notified by email when configured.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className={cardBase}>
                    <p className={`text-xs font-semibold uppercase tracking-[0.35em] ${cardMuted}`}>Pending</p>
                    <p className={`mt-2 text-3xl font-bold tabular-nums ${headingClass}`}>{resortStats.pending}</p>
                  </div>
                  <div className={cardBase}>
                    <p className={`text-xs font-semibold uppercase tracking-[0.35em] ${cardMuted}`}>Approved</p>
                    <p className={`mt-2 text-3xl font-bold tabular-nums ${headingClass}`}>{resortStats.approved}</p>
                  </div>
                  <div className={cardBase}>
                    <p className={`text-xs font-semibold uppercase tracking-[0.35em] ${cardMuted}`}>Rejected</p>
                    <p className={`mt-2 text-3xl font-bold tabular-nums ${headingClass}`}>{resortStats.rejected}</p>
                  </div>
                  <div className={cardBase}>
                    <p className={`text-xs font-semibold uppercase tracking-[0.35em] ${cardMuted}`}>Published</p>
                    <p className={`mt-2 text-3xl font-bold tabular-nums ${headingClass}`}>{resortStats.published}</p>
                    <p className={`mt-1 text-[11px] ${theme === "dark" ? "text-slate-500" : "text-muted-foreground"}`}>
                      Approved + live on marketplace
                    </p>
                  </div>
                  <div className={cardBase}>
                    <p className={`text-xs font-semibold uppercase tracking-[0.35em] ${cardMuted}`}>Total</p>
                    <p className={`mt-2 text-3xl font-bold tabular-nums ${headingClass}`}>{resortStats.total}</p>
                  </div>
                </div>

                <div className="mt-10">
                  <section className={cardBase}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className={`text-xl font-bold ${headingClass}`}>All listings</h2>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <label className={`flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide ${cardMuted}`}>
                            <span className="whitespace-nowrap">Sort</span>
                            <select
                              value={resortListFilter}
                              onChange={(e) => setResortListFilter(e.target.value)}
                              className={`min-w-[14rem] rounded-lg border px-3 py-2 text-sm font-medium outline-none ring-emerald-500/30 focus:ring-2 ${
                                theme === "dark"
                                  ? "border-slate-600 bg-slate-900 text-white"
                                  : "border-emerald-200 bg-white text-emerald-900"
                              }`}
                            >
                              {RESORT_LIST_FILTER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {resortListFilter === RESORT_FILTER_PUBLISHED && (
                            <p className={`text-[11px] ${theme === "dark" ? "text-slate-500" : "text-muted-foreground"}`}>
                              Approved + live on marketplace
                            </p>
                          )}
                        </div>
                        {loading ? (
                          <Badge>Loading…</Badge>
                        ) : resortListFilter === RESORT_FILTER_TOTAL ? (
                          <Badge>{resorts.length} total</Badge>
                        ) : (
                          <Badge>
                            {filteredResorts.length} of {resorts.length}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {filteredResorts.map((r) => (
                        <div key={r.id} className={listRow}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`line-clamp-1 font-semibold ${subText}`}>{r.name || "Unnamed resort"}</p>
                              <p className="line-clamp-1 text-xs text-muted-foreground">{r.location || "—"}</p>
                              {r.mapsUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMapsModalUrl(String(r.mapsUrl || ""))
                                    setMapsModalOpen(true)
                                  }}
                                  className={`mt-2 inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                    theme === "dark"
                                      ? "border-slate-600 bg-slate-700/80 text-emerald-200 hover:bg-slate-700"
                                      : "border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                  }`}
                                >
                                  View Google Maps pin
                                </button>
                              )}
                              <SuperAdminOwnerProfile
                                resort={r}
                                ownerDoc={ownerByUid[r.ownerUid || r.id]}
                                ownerProfilesReady={ownerProfilesReady}
                                theme={theme}
                              />
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge
                                  tone={
                                    String(r.status || "pending").toLowerCase() === "approved"
                                      ? "success"
                                      : String(r.status || "").toLowerCase() === "rejected"
                                        ? "danger"
                                        : "warn"
                                  }
                                >
                                  {r.status || "pending"}
                                </Badge>
                                {String(r.status || "").toLowerCase() === "approved" && r.published === true && (
                                  <Badge tone="success">Published</Badge>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                              {(String(r.status || "pending").toLowerCase() === "pending" ? (
                                <>
                                  <button
                                    onClick={() => openResortActionModal(r, "approve")}
                                    className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-emerald-600"
                                    type="button"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => openResortActionModal(r, "reject")}
                                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                                      theme === "dark"
                                        ? "border-red-400/50 bg-slate-800 text-red-300 hover:border-red-400"
                                        : "border-red-200 bg-white text-red-700 hover:border-red-300"
                                    }`}
                                    type="button"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <span className="text-[11px] font-medium text-muted-foreground sm:text-xs">
                                  Listing is {String(r.status || "").toLowerCase() || "—"}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      {resorts.length === 0 && (
                        <div
                          className={`rounded-xl border border-dashed p-8 text-center ${
                            theme === "dark" ? "border-slate-600" : "border-emerald-200"
                          }`}
                        >
                          <p className="text-sm text-muted-foreground">No resorts registered yet.</p>
                        </div>
                      )}
                      {resorts.length > 0 && filteredResorts.length === 0 && (
                        <div
                          className={`rounded-xl border border-dashed p-8 text-center ${
                            theme === "dark" ? "border-slate-600" : "border-emerald-200"
                          }`}
                        >
                          <p className="text-sm text-muted-foreground">No listings match this sort.</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}

            {currentPage === "audit" && (
              <div className="space-y-8">
                <div>
                  <h1 className={`text-3xl font-bold ${headingClass}`}>Audit log</h1>
                  <p className={`mt-1 text-sm ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                    Recent approve and reject actions (newest first, last 150 entries).
                  </p>
                </div>

                <section className={cardBase}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className={`text-lg font-semibold ${headingClass}`}>Activity</h2>
                    {auditLoading ? <Badge>Loading…</Badge> : <Badge>{auditLogs.length} shown</Badge>}
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr
                          className={`border-b ${theme === "dark" ? "border-slate-600 text-slate-400" : "border-emerald-100 text-emerald-800/80"}`}
                        >
                          <th className="pb-2 pr-3 font-semibold">When</th>
                          <th className="pb-2 pr-3 font-semibold">Action</th>
                          <th className="pb-2 pr-3 font-semibold">Resort</th>
                          <th className="pb-2 pr-3 font-semibold">Actor</th>
                          <th className="pb-2 font-semibold">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((row) => {
                          const when = row.createdAt?.toDate
                            ? row.createdAt.toDate()
                            : row.createdAt
                              ? new Date(row.createdAt)
                              : null
                          const whenStr =
                            when && !Number.isNaN(when.getTime())
                              ? when.toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "—"
                          return (
                            <tr
                              key={row.id}
                              className={`border-b last:border-0 ${
                                theme === "dark" ? "border-slate-700/80" : "border-emerald-50"
                              }`}
                            >
                              <td className="py-3 pr-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                                {whenStr}
                              </td>
                              <td className="py-3 pr-3 align-top">
                                <Badge tone={row.action === "approve" ? "success" : row.action === "reject" ? "danger" : "neutral"}>
                                  {row.action || "—"}
                                </Badge>
                                {row.previousStatus != null && row.newStatus != null && (
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    {String(row.previousStatus)} → {String(row.newStatus)}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 pr-3 align-top">
                                <p className={`font-medium ${headingClass}`}>{row.resortName || row.resortId || "—"}</p>
                                {row.resortId && (
                                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{row.resortId}</p>
                                )}
                              </td>
                              <td className="py-3 pr-3 align-top text-xs">
                                <p className={subText}>{row.actorEmail || "—"}</p>
                                {row.actorUid && (
                                  <p className="mt-0.5 max-w-[12rem] truncate font-mono text-[10px] text-muted-foreground">
                                    {row.actorUid}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 align-top text-xs text-muted-foreground">
                                {row.reason ? <span className="whitespace-pre-wrap break-words">{row.reason}</span> : "—"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!auditLoading && auditLogs.length === 0 && (
                    <p className="mt-4 text-sm text-muted-foreground">No audit entries yet.</p>
                  )}
                </section>
              </div>
            )}

            {currentPage === "settings" && (
              <div className="space-y-8">
                <div>
                  <h1 className={`text-3xl font-bold ${headingClass}`}>Settings</h1>
                  <p className={`mt-1 text-sm ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                    Approve / reject emails use the server mailbox from{" "}
                    <span className="font-mono text-[11px]">EMAIL_USER</span> +{" "}
                    <span className="font-mono text-[11px]">EMAIL_PASS</span> in{" "}
                    <span className="font-mono text-[11px]">.env</span> (same account for OTP, booking updates, contact,
                    feedback). You still need Google sign-in here so only super admins can trigger those sends.
                  </p>
                </div>

                <section className={cardBase}>
                  <h2 className={`mb-2 text-lg font-semibold ${headingClass}`}>Email (server only)</h2>
                  <p
                    className={`text-sm leading-relaxed ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}
                  >
                    No SMTP fields in this UI. Set Gmail + app password on the host (Vercel / server env), restart the
                    app, then use Approve / Reject.
                  </p>
                </section>

                <section className={cardBase}>
                  <h2 className={`mb-3 text-lg font-semibold ${headingClass}`}>Authorized Google accounts</h2>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Only these emails can use the super admin console after Google sign-in (configured in code).
                  </p>
                  <ul className="space-y-2">
                    {ALLOWED_SUPER_ADMIN_EMAILS.map((email) => (
                      <li
                        key={email}
                        className={`rounded-lg border px-3 py-2 font-mono text-sm ${
                          theme === "dark" ? "border-slate-600 bg-slate-900/50" : "border-emerald-100 bg-emerald-50/50"
                        }`}
                      >
                        {email}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className={cardBase}>
                  <h2 className={`mb-3 text-lg font-semibold ${headingClass}`}>App URL &amp; emails</h2>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className={`font-medium ${headingClass}`}>Current origin</dt>
                      <dd className="mt-1 font-mono text-muted-foreground">{appOrigin || "—"}</dd>
                    </div>
                    <div>
                      <dt className={`font-medium ${headingClass}`}>NEXT_PUBLIC_APP_URL</dt>
                      <dd className="mt-1 font-mono text-muted-foreground">
                        {publicAppUrl || "(not set — API may use request host or Vercel URL)"}
                      </dd>
                    </div>
                    <p className={`text-sm leading-relaxed ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                      All automated mail (marketplace approve/reject, guest OTP, booking status, contact, feedback) uses{" "}
                      <span className="font-mono text-xs">EMAIL_USER</span> /{" "}
                      <span className="font-mono text-xs">EMAIL_PASS</span> on the server.
                    </p>
                  </dl>
                </section>

                <section className={cardBase}>
                  <h2 className={`mb-2 text-lg font-semibold ${headingClass}`}>Marketplace page (`/resorts`)</h2>
                  <p className={`mb-4 text-sm ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                    Hero text, nav labels, search placeholder, and partner blurb load from{" "}
                    <span className="font-mono text-xs">settings/marketplace</span> (including the{" "}
                    <strong>marketplace header logo</strong> — separate from each resort’s admin landing branding). Resort
                    cards use <span className="font-mono text-xs">resorts</span> (when published) plus live min price /
                    photo from <span className="font-mono text-xs">rooms</span>. Optional fields on a resort doc:{" "}
                    <span className="font-mono text-xs">category</span>, <span className="font-mono text-xs">tags</span>,{" "}
                    <span className="font-mono text-xs">listingImage</span>, <span className="font-mono text-xs">fromPrice</span>,{" "}
                    <span className="font-mono text-xs">rating</span>, <span className="font-mono text-xs">reviewCount</span>.
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className={`font-medium ${headingClass}`}>Nav title</span>
                      <input
                        value={mpForm.navTitle}
                        onChange={(e) => setMpForm((p) => ({ ...p, navTitle: e.target.value }))}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className={`font-medium ${headingClass}`}>Nav subtitle</span>
                      <input
                        value={mpForm.navSubtitle}
                        onChange={(e) => setMpForm((p) => ({ ...p, navSubtitle: e.target.value }))}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>
                        Marketplace logo URL (<span className="font-mono text-xs">/resorts</span> header; also fallback tab
                        icon unless Site favicon is set below)
                      </span>
                      <input
                        value={mpForm.navLogoUrl}
                        onChange={(e) => setMpForm((p) => ({ ...p, navLogoUrl: e.target.value }))}
                        placeholder="/icon.svg or https://…"
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 font-mono text-sm dark:border-slate-600"
                      />
                      <span className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                        Leave empty to use the app default <span className="font-mono">/icon.svg</span>. Not the same as
                        Resort Admin → branding (that only affects each resort’s booking site).
                      </span>
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>Site favicon URL (browser tab icon)</span>
                      <input
                        value={mpForm.siteFaviconUrl}
                        onChange={(e) => setMpForm((p) => ({ ...p, siteFaviconUrl: e.target.value }))}
                        placeholder="/icon.svg or https://…"
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 font-mono text-sm dark:border-slate-600"
                      />
                      <span className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                        Optional. Overrides the tab icon for guest-facing pages app-wide. Empty = use marketplace logo
                        above, then <span className="font-mono">/icon.svg</span>.
                      </span>
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>Site tab title</span>
                      <input
                        value={mpForm.siteTabTitle}
                        onChange={(e) => setMpForm((p) => ({ ...p, siteTabTitle: e.target.value }))}
                        placeholder="e.g. Resort Marketplace — Book your stay"
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                      <span className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                        Browser tab text for <span className="font-mono">/resorts</span> and default home when set.
                        Resort booking URLs use <span className="font-medium">Resort name — this title</span>. Leave empty
                        to build the marketplace tab from Nav title + subtitle instead.
                      </span>
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>Hero headline</span>
                      <input
                        value={mpForm.heroHeadline}
                        onChange={(e) => setMpForm((p) => ({ ...p, heroHeadline: e.target.value }))}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className={`font-medium ${headingClass}`}>Hero eyebrow (small caps line)</span>
                      <input
                        value={mpForm.heroEyebrow}
                        onChange={(e) => setMpForm((p) => ({ ...p, heroEyebrow: e.target.value }))}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className={`font-medium ${headingClass}`}>Search placeholder</span>
                      <input
                        value={mpForm.searchPlaceholder}
                        onChange={(e) => setMpForm((p) => ({ ...p, searchPlaceholder: e.target.value }))}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>Hero subheadline</span>
                      <textarea
                        value={mpForm.heroSubheadline}
                        onChange={(e) => setMpForm((p) => ({ ...p, heroSubheadline: e.target.value }))}
                        rows={2}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>Feature pills (one per line)</span>
                      <textarea
                        value={mpForm.featurePills.join("\n")}
                        onChange={(e) =>
                          setMpForm((p) => ({
                            ...p,
                            featurePills: e.target.value
                              .split("\n")
                              .map((line) => line.trim())
                              .filter(Boolean),
                          }))
                        }
                        rows={3}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className={`font-medium ${headingClass}`}>Partner section eyebrow</span>
                      <input
                        value={mpForm.partnerEyebrow}
                        onChange={(e) => setMpForm((p) => ({ ...p, partnerEyebrow: e.target.value }))}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className={`font-medium ${headingClass}`}>Partner section headline</span>
                      <input
                        value={mpForm.partnerHeadline}
                        onChange={(e) => setMpForm((p) => ({ ...p, partnerHeadline: e.target.value }))}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>Partner section body</span>
                      <textarea
                        value={mpForm.partnerBody}
                        onChange={(e) => setMpForm((p) => ({ ...p, partnerBody: e.target.value }))}
                        rows={2}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>Empty grid title (no DB listings / no search hits)</span>
                      <input
                        value={mpForm.emptyListTitle}
                        onChange={(e) => setMpForm((p) => ({ ...p, emptyListTitle: e.target.value }))}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>Empty grid message</span>
                      <textarea
                        value={mpForm.emptyListSubtext}
                        onChange={(e) => setMpForm((p) => ({ ...p, emptyListSubtext: e.target.value }))}
                        rows={2}
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 text-sm dark:border-slate-600"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm md:col-span-2">
                      <input
                        type="checkbox"
                        checked={mpForm.showDemoResorts}
                        onChange={(e) => setMpForm((p) => ({ ...p, showDemoResorts: e.target.checked }))}
                        className="h-4 w-4 rounded border-emerald-300"
                      />
                      <span className={headingClass}>
                        Show demo resort cards (off by default — listings are from Firestore only)
                      </span>
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className={`font-medium ${headingClass}`}>
                        Legacy helpdesk UID (rooms without <span className="font-mono">ownerUid</span>)
                      </span>
                      <input
                        value={mpForm.legacyUnscopedRoomsOwnerUid}
                        onChange={(e) =>
                          setMpForm((p) => ({ ...p, legacyUnscopedRoomsOwnerUid: e.target.value }))
                        }
                        placeholder="Firebase Auth UID (Authentication → Users → UID column)"
                        className="rounded-lg border border-emerald-100 bg-background px-3 py-2 font-mono text-sm dark:border-slate-600"
                      />
                      <span className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                        If old rooms have no <span className="font-mono">ownerUid</span>, paste the Google account’s
                        Firebase UID here so those rooms roll up to one marketplace card and{" "}
                        <span className="font-mono">/stay/{"{uid}"}</span>. Optional env fallback:{" "}
                        <span className="font-mono">NEXT_PUBLIC_LEGACY_UNSCOPED_ROOMS_OWNER_UID</span>. If this UID has
                        a pending <span className="font-mono">resorts</span> doc, the card still shows from live rooms.
                      </span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveMarketplace}
                    disabled={mpSaving}
                    className="mt-4 inline-flex rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {mpSaving ? "Saving…" : "Save marketplace settings"}
                  </button>
                </section>

                <section className={cardBase}>
                  <h2 className={`mb-3 text-lg font-semibold ${headingClass}`}>Quick links</h2>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/resorts"
                      className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 dark:border-slate-600 dark:bg-slate-700 dark:text-emerald-100 dark:hover:bg-slate-600"
                    >
                      Marketplace
                    </Link>
                    <Link
                      href="/admin"
                      className="inline-flex rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                    >
                      Resort admin
                    </Link>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>

      {resortActionModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeResortActionModal()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resort-action-title"
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl sm:p-6 ${
              theme === "dark" ? "border-slate-600 bg-slate-800" : "border-emerald-100 bg-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="resort-action-title"
              className={`text-lg font-bold sm:text-xl ${theme === "dark" ? "text-white" : "text-emerald-900"}`}
            >
              {resortActionModal.kind === "approve" ? "Approve this listing?" : "Reject this listing?"}
            </h2>
            <p className={`mt-2 text-sm leading-relaxed ${theme === "dark" ? "text-slate-300" : "text-muted-foreground"}`}>
              <span className={`font-semibold ${theme === "dark" ? "text-white" : "text-emerald-900"}`}>
                {resortActionModal.resort?.name || "Unnamed resort"}
              </span>
              {resortActionModal.resort?.ownerEmail ? (
                <>
                  {" "}
                  · Owner:{" "}
                  <span className="font-mono text-xs">{resortActionModal.resort.ownerEmail}</span>
                </>
              ) : null}
            </p>
            {resortActionModal.kind === "approve" ? (
              <p className={`mt-3 text-sm ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                We’ll mark the resort and owner account as approved, then send the owner an email with a link to the
                resort admin (if email is configured).
              </p>
            ) : (
              <div className="mt-4">
                <label
                  className={`mb-2 block text-xs font-semibold uppercase tracking-wide ${theme === "dark" ? "text-slate-300" : "text-emerald-800"}`}
                  htmlFor="reject-reason-field"
                >
                  Reason for rejection <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="reject-reason-field"
                  rows={4}
                  value={rejectReasonDraft}
                  onChange={(e) => setRejectReasonDraft(e.target.value)}
                  placeholder="Explain what needs to change (maps link, name, location, etc.)"
                  className={
                    theme === "dark"
                      ? "w-full resize-y rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      : "w-full resize-y rounded-xl border border-emerald-100 bg-background px-3 py-2.5 text-sm text-foreground shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/60"
                  }
                />
              </div>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={resortActionBusy}
                onClick={closeResortActionModal}
                className={`rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-60 ${
                  theme === "dark"
                    ? "border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "border-emerald-100 bg-white text-emerald-900 hover:border-emerald-200"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resortActionBusy}
                onClick={confirmResortActionModal}
                className={`rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  resortActionModal.kind === "approve"
                    ? "bg-emerald-700 hover:bg-emerald-600"
                    : "bg-red-600 hover:bg-red-500"
                }`}
              >
                {resortActionBusy
                  ? "Working…"
                  : resortActionModal.kind === "approve"
                    ? "Confirm approve"
                    : "Confirm reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mapsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-3 md:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMapsModalOpen(false)
          }}
        >
          <div
            className="flex max-h-[min(92dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-emerald-100 bg-white shadow-2xl sm:max-h-[min(88vh,680px)] sm:max-w-lg sm:rounded-2xl md:max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-emerald-100 bg-white/90 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="min-w-0 pr-1">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-emerald-700/80 sm:text-xs sm:tracking-[0.28em]">
                  Map preview
                </p>
                <p className="mt-0.5 text-xs font-semibold leading-snug text-emerald-900 sm:text-sm">
                  Resort pin (Google Maps link)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMapsModalOpen(false)}
                className="shrink-0 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 shadow-sm transition hover:border-emerald-200 sm:px-3.5 sm:py-2 sm:text-xs sm:tracking-[0.15em]"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-4">
              {mapsPreviewLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-8 sm:gap-3 sm:px-4 sm:py-10">
                  <div className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700 sm:h-9 sm:w-9" />
                  <p className="text-center text-xs font-semibold text-emerald-900 sm:text-sm">Resolving short link…</p>
                  <p className="max-w-sm px-1 text-center text-[11px] leading-snug text-emerald-900/70 sm:text-xs">
                    Reading coordinates for the preview map.
                  </p>
                  <div className="mt-4 w-full max-w-sm border-t border-emerald-200/80 pt-4">
                    <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-900 sm:text-xs">
                      Exact resort location
                    </p>
                    <p className="mt-1 text-center text-[11px] text-emerald-900/70 sm:text-xs">
                      Opens the owner’s exact Google Maps pin — not the preview above.
                    </p>
                    <div className="mt-3 w-full sm:flex sm:justify-center">
                      <MapsLinkActions mapsModalUrl={mapsModalUrl} />
                    </div>
                  </div>
                </div>
              ) : mapsPreviewSrc ? (
                <div className="space-y-2 sm:space-y-3">
                  <div className="overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50/30 sm:rounded-xl">
                    <iframe
                      title="Resort map preview"
                      src={mapsPreviewSrc}
                      className="aspect-[5/4] max-h-[38vh] w-full min-h-[180px] sm:aspect-auto sm:h-[min(36vh,320px)] sm:max-h-[340px] md:h-[min(38vh,360px)]"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                  {mapsPreviewProvider === "osm" && (
                    <p className="text-[11px] leading-snug text-emerald-900/75 sm:text-xs sm:leading-relaxed">
                      <span className="hidden sm:inline">
                        Google blocks embedding normal Maps URLs here. This{" "}
                        <span className="font-semibold text-emerald-900">OpenStreetMap</span> view is approximate — use
                        the buttons for the exact Google pin.
                      </span>
                      <span className="sm:hidden">
                        <span className="font-semibold text-emerald-900">OSM</span> preview only — tap below for exact
                        Google Maps pin.
                      </span>
                    </p>
                  )}
                  {mapsPreviewProvider === "google" && (
                    <p className="text-[11px] leading-snug text-emerald-900/75 sm:text-xs">
                      Embed API preview — use buttons below for the owner’s original link.
                    </p>
                  )}

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 sm:rounded-xl sm:px-3.5 sm:py-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900 sm:text-xs">
                      Exact resort pin
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-emerald-900/75 sm:text-xs sm:leading-normal">
                      Owner’s Google Maps link — new tab keeps this page open.
                    </p>
                    <div className="mt-2.5 sm:mt-3">
                      <MapsLinkActions mapsModalUrl={mapsModalUrl} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:rounded-xl sm:p-4">
                  <p className="text-xs font-semibold text-amber-900 sm:text-sm">Map preview not available.</p>
                  <p className="mt-1 text-[11px] leading-snug text-amber-900/85 sm:text-sm sm:leading-relaxed">
                    {mapsModalUrl.includes("maps.app.goo.gl") || mapsModalUrl.includes("goo.gl/maps")
                      ? "Couldn’t build an embed from this short link — it may still work in Google Maps."
                      : "This link format isn’t supported for preview. Try opening it in Google Maps."}
                  </p>
                  <div className="mt-3 rounded-md border border-amber-200 bg-white p-2.5 sm:p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 sm:text-xs sm:tracking-[0.2em]">
                      Provided link
                    </p>
                    <p className="mt-1.5 break-all text-[11px] text-amber-900/90 sm:text-xs">{mapsModalUrl}</p>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(mapsModalUrl)
                          toast.success("Link copied.")
                        } catch {
                          toast.error("Failed to copy link.")
                        }
                      }}
                      className="w-full min-h-[40px] rounded-full bg-emerald-700 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-600 sm:w-fit sm:px-5 sm:text-xs sm:tracking-[0.15em]"
                    >
                      Copy link
                    </button>
                    <MapsLinkActions mapsModalUrl={mapsModalUrl} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

