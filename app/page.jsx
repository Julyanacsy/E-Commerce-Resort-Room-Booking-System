"use client"

import { useState, useEffect, useRef } from "react"
import {
  Menu,
  X,
  Star,
  MapPin,
  Phone,
  Mail,
  Send,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Loader2,
  Moon,
  Sun,
  LayoutDashboard,
  Upload,
  Navigation,
} from "lucide-react"
import { BRANDING_DEFAULTS, useBranding } from "@/hooks/use-branding"
import { normalizeOwnerUidFromSearchParam } from "@/lib/booking-tenant"
import { useMarketplaceSettings } from "@/hooks/use-marketplace-settings"
import { useResortOwnerBranding } from "@/hooks/use-resort-owner-branding"
import DynamicHead from "@/components/dynamic-head"
import { db } from "@/lib/firebase"
import { collection, doc, query, orderBy, onSnapshot, where } from "firebase/firestore"
import { syncManager } from "@/lib/offline-storage"
import PWAInstallButton from "@/components/pwa-install-button"
import dynamic from "next/dynamic"

// Dynamically import ReCAPTCHA to avoid SSR issues
const ReCAPTCHA = dynamic(() => import("react-google-recaptcha"), {
  ssr: false,
})
import { toast } from "sonner"
import { Toaster } from "sonner"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { compressImageFileToDataUrl } from "@/lib/data-url-files"
import { getGoogleDirectionsUrl, getMapPreviewIframeSrc } from "@/lib/maps-preview-url"

// Feedback will be fetched from Firestore dynamically

// Room Card Component with Image Carousel
function RoomCard({ room, onViewDetails, onImageClick, theme = "light" }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const images = room.images?.length > 0 ? room.images.slice(0, 3) : []

  // Auto-slide images every 4 seconds
  useEffect(() => {
    if (images.length <= 1) return

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length)
    }, 4000)

    return () => clearInterval(interval)
  }, [images.length])

  const goToPrevious = (e) => {
    e.stopPropagation()
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  const goToNext = (e) => {
    e.stopPropagation()
    setCurrentImageIndex((prev) => (prev + 1) % images.length)
  }

  const handleImageClick = (e, image) => {
    e.stopPropagation()
    onImageClick(image)
  }

  const handleBookNow = (e) => {
    e.stopPropagation()
    // Don't proceed if room is not available
    const availability = room.availability?.trim() || room.availability
    if (availability && availability !== "Available") {
      return
    }
    // Pre-fill the room type in booking form
    if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent("prefillRoom", {
        detail: { roomName: room.name },
      })
    )
    }
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" })
  }

  // Check if room is available for booking
  const availability = room.availability?.trim() || room.availability
  const isAvailable = !availability || availability === "Available"
  const isDark = theme === "dark"

  return (
    <div className={`group rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 ${
      isDark
        ? "bg-slate-800 border border-slate-700"
        : "bg-white border border-emerald-50"
    }`}>
      {/* Image Carousel */}
      <div className={`relative h-64 overflow-hidden ${
        isDark ? "bg-slate-700" : "bg-emerald-50"
      }`}>
        {images.length > 0 ? (
          <>
            <img
              src={images[currentImageIndex]}
              alt={`${room.name} - Image ${currentImageIndex + 1}`}
              className="w-full h-full object-cover transition-opacity duration-500 cursor-pointer"
              onClick={(e) => handleImageClick(e, images[currentImageIndex])}
            />
            {/* Navigation Arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={goToPrevious}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-emerald-700 rounded-full p-2 transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-emerald-700 rounded-full p-2 transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                  aria-label="Next image"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
            {/* Image Indicators */}
            {images.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation()
                      setCurrentImageIndex(idx)
                    }}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentImageIndex ? "w-8 bg-white" : "w-2 bg-white/50"
                    }`}
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
            )}
            {/* Zoom Icon Overlay */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-white/90 rounded-full p-2 shadow-lg">
                <ZoomIn size={18} className="text-emerald-700" />
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-emerald-600">
            <p className="text-sm">No image available</p>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-2">
          <h3 className={`text-xl font-bold line-clamp-1 flex-1 ${
            isDark ? "text-white" : "text-emerald-700"
          }`}>{room.name}</h3>
          {room.featured && (
            <span className={`ml-2 rounded-full px-2 py-1 text-xs font-semibold ${
              isDark
                ? "bg-amber-900/50 text-amber-300"
                : "bg-amber-100 text-amber-700"
            }`}>
              Featured
            </span>
          )}
        </div>

        <div className="mb-4">
          <p className={`text-2xl font-bold ${
            isDark ? "text-amber-400" : "text-amber-600"
          }`}>
            ₱{room.price?.toLocaleString() || 0}
            <span className={`text-sm font-normal ${
              isDark ? "text-gray-400" : "text-gray-500"
            }`}>/night</span>
          </p>
          {room.discount > 0 && (
            <p className={`text-sm line-through ${
              isDark ? "text-gray-500" : "text-gray-500"
            }`}>
              ₱{Math.round((room.price * 100) / (100 - room.discount)).toLocaleString()}
            </p>
          )}
        </div>

        <p className={`mb-4 text-sm ${
          isDark ? "text-gray-400" : "text-gray-600"
        }`}>Max {room.maxGuests || 2} guests</p>

        {room.amenities?.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {room.amenities.slice(0, 3).map((amenity, idx) => (
              <span
                key={idx}
                className={`text-xs rounded-full px-2 py-1 font-medium ${
                  isDark
                    ? "bg-emerald-900/50 text-emerald-300"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {amenity}
              </span>
            ))}
            {room.amenities.length > 3 && (
              <span className={`text-xs rounded-full px-2 py-1 font-medium ${
                isDark
                  ? "bg-slate-700 text-gray-300"
                  : "bg-gray-100 text-gray-600"
              }`}>
                +{room.amenities.length - 3} more
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onViewDetails}
            className={`flex-1 py-2.5 rounded-lg transition-all duration-200 font-semibold text-sm ${
              isDark
                ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            View Details
          </button>
          <button
            onClick={handleBookNow}
            disabled={!isAvailable}
            className={`flex-1 py-2.5 rounded-lg transition-all duration-200 font-semibold text-sm ${
              isAvailable
                ? isDark
                  ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 shadow-md hover:shadow-lg transform hover:scale-105 cursor-pointer"
                  : "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 shadow-md hover:shadow-lg transform hover:scale-105 cursor-pointer"
                : isDark
                  ? "bg-slate-700 text-gray-500 cursor-not-allowed opacity-60"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed opacity-60"
            }`}
            title={!isAvailable ? `Room is currently ${availability?.toLowerCase() || "unavailable"}. Only available rooms can be booked.` : ""}
          >
            {isAvailable ? "Book Now" : availability === "Maintenance" ? "Under Maintenance" : "Unavailable"}
          </button>
        </div>
      </div>
    </div>
  )
}

const ROOMS_PER_PAGE = 6

export default function Home() {
  const { branding: globalBranding } = useBranding()
  const { settings: marketplaceSettings } = useMarketplaceSettings()
  const [bookingOwnerUid, setBookingOwnerUid] = useState(null)

  useEffect(() => {
    const read = () => {
      if (typeof window === "undefined") return
      const params = new URLSearchParams(window.location.search)
      setBookingOwnerUid(normalizeOwnerUidFromSearchParam(params.get("o")) || null)
    }
    read()
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [])

  const legacyUnscopedUid = String(marketplaceSettings.legacyUnscopedRoomsOwnerUid || "").trim()
  const legacyUnscopedLanding =
    Boolean(bookingOwnerUid && legacyUnscopedUid && bookingOwnerUid === legacyUnscopedUid)
  const paymentRequired = Boolean(bookingOwnerUid)

  const { branding: ownerBrandingSnapshot, loading: ownerBrandingLoading } =
    useResortOwnerBranding(bookingOwnerUid)
  /** Per-owner doc if present; while loading or if no doc, use global `settings/branding` (legacy hosts). */
  const branding = !bookingOwnerUid
    ? globalBranding
    : ownerBrandingLoading
      ? globalBranding
      : (ownerBrandingSnapshot ?? globalBranding)

  /** Marketplace listing fields (`resorts/{uid}`) — maps link + location label from resort admin */
  const [resortMarketplace, setResortMarketplace] = useState({ mapsUrl: "", location: "" })
  const [mapIframe, setMapIframe] = useState(null)

  useEffect(() => {
    if (!db || !bookingOwnerUid) {
      setResortMarketplace({ mapsUrl: "", location: "" })
      return undefined
    }
    const ref = doc(db, "resorts", bookingOwnerUid)
    return onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : {}
      setResortMarketplace({
        mapsUrl: typeof d.mapsUrl === "string" ? d.mapsUrl.trim() : "",
        location: typeof d.location === "string" ? d.location.trim() : "",
      })
    })
  }, [bookingOwnerUid])

  useEffect(() => {
    let cancelled = false
    const raw = String(resortMarketplace.mapsUrl || "").trim()
    if (!raw || !bookingOwnerUid) {
      setMapIframe(null)
      return undefined
    }

    const direct = getMapPreviewIframeSrc(raw)
    if (direct) {
      setMapIframe(direct)
      return undefined
    }

    async function resolveShortThenPreview() {
      try {
        const u = new URL(raw)
        const host = u.hostname.replace(/^www\./, "").toLowerCase()
        const isShort =
          host === "maps.app.goo.gl" || (host === "goo.gl" && u.pathname.toLowerCase().includes("/maps"))
        if (!isShort) {
          if (!cancelled) setMapIframe(null)
          return
        }
        const res = await fetch(`/api/maps/resolve-short-link?url=${encodeURIComponent(raw)}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        const resolved = typeof data?.url === "string" ? data.url.trim() : ""
        if (!resolved || cancelled) return
        const preview = getMapPreviewIframeSrc(resolved)
        if (!cancelled) setMapIframe(preview)
      } catch {
        if (!cancelled) setMapIframe(null)
      }
    }
    resolveShortThenPreview()
    return () => {
      cancelled = true
    }
  }, [resortMarketplace.mapsUrl, bookingOwnerUid])

  const navLinks = ["Home", "Rooms", "Booking", "About", "Contact"]
  /** Marketplace listing has something to show above contact (map link and/or area label) */
  const hasResortListingHint =
    Boolean(bookingOwnerUid) &&
    (String(resortMarketplace.mapsUrl || "").trim() ||
      String(resortMarketplace.location || "").trim())
  const showMapEmbedCard =
    Boolean(mapIframe?.src) || Boolean(String(resortMarketplace.mapsUrl || "").trim())

  const googleDirectionsUrl =
    bookingOwnerUid &&
    getGoogleDirectionsUrl(String(resortMarketplace.mapsUrl || "").trim(), {
      fallbackAddress:
        String(resortMarketplace.location || "").trim() ||
        String(branding.address || "").trim(),
      fallbackLabel: String(branding.name || "").trim(),
    })

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeRoom, setActiveRoom] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [previewImage, setPreviewImage] = useState(null)
  const [roomsPage, setRoomsPage] = useState(1)
  const [isModalClosing, setIsModalClosing] = useState(false)
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("landing-theme")
      return saved || "light"
    }
    return "light"
  })

  // Apply theme to document
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (theme === "dark") {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
      localStorage.setItem("landing-theme", theme)
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    checkIn: "",
    checkOut: "",
    guests: "",
    roomType: "",
    specialRequests: "",
  })
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState("")
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [paymentQrUrl, setPaymentQrUrl] = useState("")
  const [paymentInstructions, setPaymentInstructions] = useState("")
  const [proofOfPaymentUrl, setProofOfPaymentUrl] = useState("")
  const [validIdUrl, setValidIdUrl] = useState("")
  const [uploadingProof, setUploadingProof] = useState(false)
  const [uploadingId, setUploadingId] = useState(false)
  
  // Auto-submit when OTP reaches 6 digits
  useEffect(() => {
    if (otpCode.length === 6 && !otpVerifying && otpSent) {
      // Small delay to ensure state is updated
      const timer = setTimeout(() => {
        // Create a synthetic submit event
        const syntheticEvent = {
          preventDefault: () => {},
          target: { closest: () => null },
        }
        handleBooking(syntheticEvent)
      }, 300) // Small delay to show the loading state
      return () => clearTimeout(timer)
    }
  }, [otpCode, otpVerifying, otpSent])
  const [recaptchaToken, setRecaptchaToken] = useState(null)
  const recaptchaRef = useRef(null)
  const [dateAvailability, setDateAvailability] = useState({ checking: false, available: true, message: "" })
  const [bookedDates, setBookedDates] = useState([])
  const [bookedRanges, setBookedRanges] = useState([])
  const [checkInCalendarOpen, setCheckInCalendarOpen] = useState(false)
  const [checkOutCalendarOpen, setCheckOutCalendarOpen] = useState(false)
  const [feedback, setFeedback] = useState({ name: "", email: "", rating: 5, message: "" })
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbacks, setFeedbacks] = useState([])
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(true)
  const [currentFeedbackIndex, setCurrentFeedbackIndex] = useState(0)
  const [bookingConfirmed, setBookingConfirmed] = useState(false)
  const [contact, setContact] = useState({ name: "", email: "", message: "" })
  const [contactSubmitting, setContactSubmitting] = useState(false)

  const calculateNights = (checkIn, checkOut) => {
    try {
      if (!checkIn || !checkOut) return 0
      const inDate = checkIn.includes("T") ? new Date(checkIn) : new Date(checkIn + "T00:00:00")
      const outDate = checkOut.includes("T") ? new Date(checkOut) : new Date(checkOut + "T00:00:00")
      if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) return 0
      inDate.setHours(0, 0, 0, 0)
      outDate.setHours(0, 0, 0, 0)
      const diff = outDate.getTime() - inDate.getTime()
      const nights = Math.ceil(diff / (1000 * 60 * 60 * 24))
      return nights > 0 ? nights : 1
    } catch {
      return 0
    }
  }

  const selectedRoom = rooms.find((r) => String(r?.name || "").trim() === String(formData.roomType || "").trim()) || null
  const basePrice = Number(selectedRoom?.price || 0) || 0
  const discount = Number(selectedRoom?.discount || 0) || 0
  const pricePerNight = discount > 0 ? basePrice * (1 - discount / 100) : basePrice
  const nights = calculateNights(formData.checkIn, formData.checkOut)
  const estimatedTotal = nights > 0 ? pricePerNight * nights : 0
  const formatPhp = (n) =>
    `₱${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  useEffect(() => {
    if (!db || !bookingOwnerUid) {
      setPaymentQrUrl("")
      setPaymentInstructions("")
      return undefined
    }
    const unsub = onSnapshot(doc(db, "resortOwners", bookingOwnerUid, "site", "payment"), (snap) => {
      const d = snap.exists() ? snap.data() : {}
      setPaymentQrUrl(String(d?.gcashQrUrl || "").trim())
      setPaymentInstructions(String(d?.instructions || "").trim())
    })
    return () => unsub()
  }, [bookingOwnerUid])

  const uploadGuestFile = async (file) => {
    /** Shrinks photos client-side so proof/ID fit in one Firestore booking doc (no Storage). */
    return await compressImageFileToDataUrl(file)
  }

  // Fetch rooms from Firestore (legacy landing = no ownerUid; `?o=` = that resort's rooms)
  useEffect(() => {
    const roomsRef = collection(db, "rooms")
    const q =
      bookingOwnerUid && !legacyUnscopedLanding
        ? query(roomsRef, where("ownerUid", "==", bookingOwnerUid))
        : query(roomsRef)

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let roomsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        if (!bookingOwnerUid) {
          roomsData = roomsData.filter((room) => !room.ownerUid)
        } else if (legacyUnscopedLanding) {
          roomsData = roomsData.filter(
            (room) =>
              !room.ownerUid ||
              String(room.ownerUid || "").trim() === "" ||
              room.ownerUid === bookingOwnerUid,
          )
        }
        roomsData = roomsData
          .filter((room) => {
            if (!room.availability) {
              return true
            }
            return room.availability === "Available"
          })
          .sort((a, b) => {
            if (a.createdAt && b.createdAt) {
              return b.createdAt.toMillis() - a.createdAt.toMillis()
            }
            return 0
          })
        setRooms(roomsData)
        setLoadingRooms(false)
      },
      (error) => {
        console.error("Error fetching rooms:", error)
        setLoadingRooms(false)
      }
    )

    return () => unsubscribe()
  }, [bookingOwnerUid, legacyUnscopedLanding])

  // Calculate pagination
  const totalRoomPages = Math.max(1, Math.ceil(rooms.length / ROOMS_PER_PAGE))
  const paginatedRooms = rooms.slice((roomsPage - 1) * ROOMS_PER_PAGE, roomsPage * ROOMS_PER_PAGE)

  // Smooth scroll handler
  const handleSmoothScroll = (e, targetId) => {
    e.preventDefault()
    const element = document.getElementById(targetId)
    if (element) {
      const offset = 80 // Account for fixed navbar height
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      })
    }
  }

  // Lock body scroll when modal is open
  useEffect(() => {
    if (activeRoom) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [activeRoom])

  // Listen for room prefill event
  useEffect(() => {
    const handlePrefillRoom = (event) => {
      setFormData((prev) => ({ ...prev, roomType: event.detail.roomName }))
    }
    window.addEventListener("prefillRoom", handlePrefillRoom)
    return () => window.removeEventListener("prefillRoom", handlePrefillRoom)
  }, [])

  // Fetch booked dates when room type is selected
  useEffect(() => {
    const fetchBookedDates = async () => {
      if (!formData.roomType) {
        setBookedDates([])
        setBookedRanges([])
        return
      }

      try {
        const response = await fetch("/api/booking/get-booked-dates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomType: formData.roomType, ownerUid: bookingOwnerUid }),
        })

        const data = await response.json()

        if (response.ok) {
          const dates = data.bookedDates || []
          console.log("📅 Fetched booked dates for", formData.roomType, ":", dates)
          console.log("📅 Booked ranges:", data.bookedRanges || [])
          setBookedDates(dates)
          setBookedRanges(data.bookedRanges || [])
        } else {
          console.error("❌ Failed to fetch booked dates:", data.error)
          setBookedDates([])
          setBookedRanges([])
        }
      } catch (error) {
        console.error("❌ Error fetching booked dates:", error)
        setBookedDates([])
        setBookedRanges([])
      }
    }

    fetchBookedDates()
  }, [formData.roomType, bookingOwnerUid])

  // Quick validation - no async checking, just check booked dates locally
  useEffect(() => {
    // Reset availability when dates change
    if (!formData.roomType || !formData.checkIn) {
      setDateAvailability({ checking: false, available: true, message: "" })
      return
    }

    // Check if check-in date is booked
    if (bookedDates.includes(formData.checkIn)) {
      setDateAvailability({
        checking: false,
        available: false,
        message: "This check-in date is already booked. Please select a different date.",
      })
      return
    }

    // If only check-in is selected
    if (!formData.checkOut) {
      setDateAvailability({
        checking: false,
        available: true,
        message: "Please select a check-out date.",
      })
      return
    }

    // Both dates selected - validate
    const checkInDate = new Date(formData.checkIn + "T00:00:00")
    const checkOutDate = new Date(formData.checkOut + "T00:00:00")
    
    if (checkInDate >= checkOutDate) {
      setDateAvailability({ checking: false, available: false, message: "Check-out must be after check-in" })
      return
    }

    // Check if check-out date is booked
    if (bookedDates.includes(formData.checkOut)) {
      setDateAvailability({
        checking: false,
        available: false,
        message: "This check-out date is already booked. Please select a different date.",
      })
      return
    }

    // Quick check: if any date in the range is booked, it's not available
    // Check ALL dates from check-in to check-out (inclusive)
    // Use local date formatting to avoid timezone issues
    const checkInParts = formData.checkIn.split("-").map(Number)
    const checkOutParts = formData.checkOut.split("-").map(Number)
    const startDate = new Date(checkInParts[0], checkInParts[1] - 1, checkInParts[2])
    const endDate = new Date(checkOutParts[0], checkOutParts[1] - 1, checkOutParts[2])
    
    const hasBookedDate = []
    
    console.log("🔍 Checking date range:", {
      checkIn: formData.checkIn,
      checkOut: formData.checkOut,
      bookedDates: bookedDates,
      bookedDatesCount: bookedDates.length
    })
    
    // Loop through each date from check-in to check-out (inclusive)
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      // Format date in local timezone (YYYY-MM-DD)
      const year = currentDate.getFullYear()
      const month = String(currentDate.getMonth() + 1).padStart(2, "0")
      const day = String(currentDate.getDate()).padStart(2, "0")
      const dateStr = `${year}-${month}-${day}`
      
      if (bookedDates.includes(dateStr)) {
        hasBookedDate.push(dateStr)
        console.log("❌ Found booked date in range:", dateStr)
      }
      
      // Move to next day in local timezone
      currentDate.setDate(currentDate.getDate() + 1)
    }

    if (hasBookedDate.length > 0) {
      console.log("🚫 Date range blocked by booked dates:", hasBookedDate)
      setDateAvailability({
        checking: false,
        available: false,
        message: `Selected date range includes already booked dates (${hasBookedDate.join(", ")}). Please choose different dates.`,
      })
      return
    }
    
    console.log("✅ Date range is available")
    // All dates are available
    setDateAvailability({ checking: false, available: true, message: "" })
  }, [formData.roomType, formData.checkIn, formData.checkOut, bookedDates])

  // Helper function to check if a date is disabled (booked or in the past)
  const isDateDisabled = (dateString) => {
    if (!dateString) return false
    const date = new Date(dateString + "T00:00:00")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Disable past dates
    if (date < today) return true
    
    // Disable booked dates
    if (bookedDates.includes(dateString)) return true
    
    return false
  }

  const handleBooking = async (e) => {
    e.preventDefault()
    
    if (!otpSent) {
      if (paymentRequired) {
        if (!paymentQrUrl) {
          toast.error("Payment QR code is not available yet. Please contact the resort admin.")
          return
        }
        if (!proofOfPaymentUrl || !validIdUrl) {
          toast.error("Please upload proof of payment and 1 valid ID before sending OTP.")
          return
        }
      }
      // Step 1: Check date availability before proceeding
      if (!dateAvailability.available) {
        toast.error(dateAvailability.message || "Selected dates are not available. Please choose different dates.")
        return
      }

      const recaptchaConfigured = Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY)

      // Step 2: reCAPTCHA (only when site key is set — otherwise skip for local/dev)
      if (recaptchaConfigured && !recaptchaToken) {
        toast.error("Please complete the reCAPTCHA verification")
        return
      }

      setBookingSubmitting(true)
      try {
        if (recaptchaConfigured && recaptchaToken) {
          const recaptchaResponse = await fetch("/api/booking/verify-recaptcha", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: recaptchaToken }),
          })

          const recaptchaData = await recaptchaResponse.json()

          if (!recaptchaResponse.ok) {
            toast.error(recaptchaData.error || "reCAPTCHA verification failed")
            recaptchaRef.current?.reset()
            setRecaptchaToken(null)
            return
          }
        }

        // Normalize email (trim and lowercase)
        const normalizedEmail = formData.email.trim().toLowerCase()
        const response = await fetch("/api/booking/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail, ownerUid: bookingOwnerUid }),
        })
        
        const data = await response.json()
        
        if (response.ok) {
          setOtpSent(true)
          setBookingConfirmed(false)
          toast.success("OTP sent successfully! Check your email.")
          // Reset reCAPTCHA
          recaptchaRef.current?.reset()
          setRecaptchaToken(null)
        } else {
          // Special handling for booking limit
          if (data.limitReached) {
            toast.error(data.error || "This email has reached the booking limit.", {
              duration: 8000,
            })
          } else {
            toast.error(data.error || "Failed to send OTP. Please try again.", {
              ...(data.hint
                ? {
                    description: `${data.hint}${data.code ? ` (${data.code})` : ""}`,
                    duration: 12000,
                  }
                : { duration: 6000 }),
            })
          }
        }
      } catch (error) {
        console.error("Error sending OTP:", error)
        toast.error("Failed to send OTP. Please try again.")
      } finally {
        setBookingSubmitting(false)
      }
    } else {
      // Step 3: Verify OTP and save booking
      setOtpVerifying(true)
      try {
        // Normalize email (trim and lowercase) and OTP (trim)
        const normalizedEmail = formData.email.trim().toLowerCase()
        const normalizedOtp = otpCode.trim()
        
        // Use offline-first approach
        const result = await syncManager.submitWithOfflineSupport(
          "/api/booking/verify-otp",
          "POST",
          {
            ...formData,
            email: normalizedEmail,
            otp: normalizedOtp,
            ownerUid: bookingOwnerUid,
            ...(paymentRequired ? { proofOfPaymentUrl, validIdUrl } : {}),
          },
          "booking",
          24 * 60 * 60 * 1000 // 24 hours max age
        )
        
        if (result.success) {
          toast.success("Booking confirmed successfully! We've sent a confirmation email. Your booking status is pending admin approval.", {
            duration: 6000,
          })
          // Reset form
          setFormData({
            name: "",
            email: "",
            phone: "",
            checkIn: "",
            checkOut: "",
            guests: "",
            roomType: "",
            specialRequests: "",
          })
          setProofOfPaymentUrl("")
          setValidIdUrl("")
          setOtpSent(false)
          setOtpCode("")
    setBookingConfirmed(true)
        } else if (result.offlineId) {
          // Saved for offline - show success message
          toast.success("Your booking is saved offline and will be submitted when you're back online!", {
            duration: 6000,
            })
          // Reset form
          setFormData({
            name: "",
            email: "",
            phone: "",
            checkIn: "",
            checkOut: "",
            guests: "",
            roomType: "",
            specialRequests: "",
            })
          setProofOfPaymentUrl("")
          setValidIdUrl("")
          setOtpSent(false)
          setOtpCode("")
          setBookingConfirmed(true)
          } else {
          toast.error(result.error || "Failed to submit booking. Please try again.")
        }
      } catch (error) {
        console.error("Error verifying OTP:", error)
        toast.error(`Failed to verify OTP. Error: ${error.message || "Unknown error"}`)
      } finally {
        setOtpVerifying(false)
      }
    }
  }

  // Fetch feedbacks from Firestore
  useEffect(() => {
    const feedbacksRef = collection(db, "feedbacks")
    const q =
      bookingOwnerUid && !legacyUnscopedLanding
        ? query(feedbacksRef, where("ownerUid", "==", bookingOwnerUid))
        : query(feedbacksRef)

    const tenantOk = (fb) => {
      if (!bookingOwnerUid) return !fb.ownerUid
      if (legacyUnscopedLanding) {
        return !fb.ownerUid || fb.ownerUid === bookingOwnerUid
      }
      return fb.ownerUid === bookingOwnerUid
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const feedbacksData = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((fb) => {
            const status = (fb.status || "").trim()
            return status === "Published" && tenantOk(fb)
          })
          .sort((a, b) => {
            // Sort by createdAt descending (newest first)
            if (a.createdAt && b.createdAt) {
              // Handle Firestore Timestamp
              if (a.createdAt.toMillis && b.createdAt.toMillis) {
                return b.createdAt.toMillis() - a.createdAt.toMillis()
              }
              // Handle regular Date objects
              if (a.createdAt.getTime && b.createdAt.getTime) {
                return b.createdAt.getTime() - a.createdAt.getTime()
              }
            }
            return 0
          })
          .slice(0, 9) // Limit to 9 most recent feedbacks
        
        console.log("Fetched feedbacks:", feedbacksData.length, feedbacksData)
        setFeedbacks(feedbacksData)
        setLoadingFeedbacks(false)
      },
      (error) => {
        console.error("Error fetching feedbacks:", error)
        // Try to fetch without query if there's an index error
        if (error.code === "failed-precondition") {
          console.warn("Firestore index missing. Fetching all feedbacks without filter...")
          const simpleQuery = query(feedbacksRef)
          onSnapshot(
            simpleQuery,
            (snapshot) => {
              const allFeedbacks = snapshot.docs
                .map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }))
                .filter((fb) => {
                  const status = (fb.status || "").trim()
                  return status === "Published" && tenantOk(fb)
                })
                .sort((a, b) => {
                  if (a.createdAt && b.createdAt) {
                    if (a.createdAt.toMillis && b.createdAt.toMillis) {
                      return b.createdAt.toMillis() - a.createdAt.toMillis()
                    }
                    if (a.createdAt.getTime && b.createdAt.getTime) {
                      return b.createdAt.getTime() - a.createdAt.getTime()
                    }
                  }
                  return 0
                })
                .slice(0, 9)
              console.log("Fetched feedbacks (fallback):", allFeedbacks.length, allFeedbacks)
              setFeedbacks(allFeedbacks)
              setLoadingFeedbacks(false)
            },
            (fallbackError) => {
              console.error("Fallback query also failed:", fallbackError)
              setLoadingFeedbacks(false)
            }
          )
        } else {
          setLoadingFeedbacks(false)
        }
      }
    )

    return () => {
      unsubscribe()
    }
  }, [bookingOwnerUid, legacyUnscopedLanding])

  // Auto-scroll feedbacks every 5 seconds
  useEffect(() => {
    if (feedbacks.length <= 3) return // No need to scroll if 3 or less

    const interval = setInterval(() => {
      setCurrentFeedbackIndex((prev) => {
        const maxIndex = Math.max(0, feedbacks.length - 3)
        if (prev >= maxIndex) {
          return 0 // Loop back to start
        }
        return prev + 3 // Move to next set of 3
      })
    }, 5000) // Change every 5 seconds

    return () => clearInterval(interval)
  }, [feedbacks.length])

  const handleFeedback = async (e) => {
    e.preventDefault()
    
    setFeedbackSubmitting(true)
    
    try {
      const result = await syncManager.submitWithOfflineSupport(
        "/api/feedback/submit",
        "POST",
        {
          name: feedback.name,
          email: feedback.email,
          rating: feedback.rating,
          message: feedback.message,
          ownerUid: bookingOwnerUid,
        },
        "feedback",
        7 * 24 * 60 * 60 * 1000 // 7 days max age for feedback
      )

      if (result.success) {
        toast.success("Thank you for your feedback! We appreciate your input.")
    setFeedback({ name: "", email: "", rating: 5, message: "" })
      } else if (result.offlineId) {
        toast.success("Your feedback is saved offline and will be submitted when you're back online!")
        setFeedback({ name: "", email: "", rating: 5, message: "" })
      } else {
        toast.error(result.error || "Failed to submit feedback. Please try again.")
      }
    } catch (error) {
      console.error("Error submitting feedback:", error)
      toast.error("Failed to submit feedback. Please try again.")
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  const handleContact = async (e) => {
    e.preventDefault()
    
    setContactSubmitting(true)
    
    try {
      const result = await syncManager.submitWithOfflineSupport(
        "/api/contact/send-message",
        "POST",
        {
          name: contact.name,
          email: contact.email,
          message: contact.message,
          ownerUid: bookingOwnerUid,
        },
        "contact",
        7 * 24 * 60 * 60 * 1000 // 7 days max age for contact messages
      )

      if (result.success) {
        toast.success("Message sent successfully! We'll get back to you soon.")
    setContact({ name: "", email: "", message: "" })
      } else if (result.offlineId) {
        toast.success("Your message is saved offline and will be sent when you're back online!")
        setContact({ name: "", email: "", message: "" })
      } else {
        toast.error(result.error || "Failed to send message. Please try again.")
      }
    } catch (error) {
      console.error("Error sending contact message:", error)
      toast.error("Failed to send message. Please try again.")
    } finally {
      setContactSubmitting(false)
    }
  }

  const handleModalClose = () => {
    setIsModalClosing(true)
    setTimeout(() => {
      setActiveRoom(null)
      setIsModalClosing(false)
    }, 300)
  }

  const getInitials = (raw) => {
    const name = String(raw || "").trim()
    if (!name) return "R"
    const parts = name.split(/\s+/).filter(Boolean)
    const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).filter(Boolean)
    return (letters.join("") || name[0]?.toUpperCase() || "R").slice(0, 2)
  }

  const BrandLogo = ({ className, borderClassName, textClassName }) => {
    if (branding.logo) {
      return (
        <img
          src={branding.logo}
          alt={`${branding.name} logo`}
          className={className}
        />
      )
    }
    return (
      <div
        aria-label={`${branding.name} logo`}
        className={`${className} flex items-center justify-center ${borderClassName || ""} ${textClassName || ""}`}
      >
        <LayoutDashboard className="h-5 w-5" strokeWidth={2.2} />
      </div>
    )
  }

  return (
    <div className={`min-h-screen transition-colors ${
      theme === "dark"
        ? "bg-gradient-to-b from-slate-900 to-slate-800"
        : "bg-gradient-to-b from-slate-50 to-white"
    }`} style={{ scrollBehavior: "smooth" }}>
      <style jsx global>{`
        html {
          scroll-behavior: smooth;
        }
      `}</style>
      <DynamicHead brandingOverride={bookingOwnerUid ? branding : null} />
      {/* Navigation */}
      <nav className={`fixed w-full top-0 z-50 shadow-md transition-colors ${
        theme === "dark" ? "bg-slate-800" : "bg-white"
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <BrandLogo
                className={`h-10 w-10 rounded-full object-cover border ${
                  theme === "dark" ? "border-slate-600 bg-slate-700" : "border-emerald-100 bg-emerald-50"
                }`}
                textClassName={theme === "dark" ? "text-emerald-200" : "text-emerald-700"}
              />
              <div className={`text-xl sm:text-2xl font-bold tracking-[0.2em] uppercase hidden sm:block ${
                theme === "dark" ? "text-white" : "text-emerald-700"
              }`}>
                {branding.name}
              </div>
            </div>
            <div className="hidden md:flex md:items-center md:gap-x-5 lg:gap-x-7">
              {navLinks.map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  onClick={(e) => handleSmoothScroll(e, item.toLowerCase())}
                  className={`text-sm font-medium tracking-wide transition lg:text-[15px] ${
                    theme === "dark"
                      ? "text-gray-300 hover:text-white"
                      : "text-gray-700 hover:text-emerald-700"
                  }`}
                >
                  {item}
                </a>
              ))}
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-lg transition ${
                  theme === "dark"
                    ? "text-gray-300 hover:bg-slate-700 hover:text-white"
                    : "text-gray-700 hover:bg-gray-100 hover:text-emerald-700"
                }`}
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-lg transition ${
                  theme === "dark"
                    ? "text-gray-300 hover:bg-slate-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
                className={`transition-transform duration-200 ${
                  theme === "dark" ? "text-gray-300" : "text-gray-700"
                }`}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
          <div 
            className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
              mobileMenuOpen 
                ? "max-h-96 opacity-100 pb-4" 
                : "max-h-0 opacity-0 pb-0"
            }`}
          >
            <div className="flex flex-col space-y-3 pt-2">
              {navLinks.map((item, index) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  onClick={(e) => {
                    handleSmoothScroll(e, item.toLowerCase())
                    setMobileMenuOpen(false) // Close mobile menu after clicking
                  }}
                  className={`transition-all duration-200 cursor-pointer transform hover:translate-x-1 ${
                    theme === "dark"
                      ? "text-gray-300 hover:text-white"
                      : "text-gray-700 hover:text-emerald-700"
                  } ${
                    mobileMenuOpen 
                      ? "opacity-100 translate-x-0" 
                      : "opacity-0 -translate-x-4"
                  }`}
                  style={{
                    transitionDelay: mobileMenuOpen ? `${index * 50}ms` : "0ms"
                  }}
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        id="home"
        className="relative mt-16 overflow-hidden px-4 pb-24 pt-28 text-white sm:px-6 sm:pb-28 md:pb-32 lg:px-8"
        style={
          branding.heroImageUrl
            ? {
                backgroundImage: `url(${branding.heroImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {!branding.heroImageUrl && (
          <div
            className={`absolute inset-0 ${
              theme === "dark"
                ? "bg-gradient-to-r from-slate-800 to-slate-700"
                : "bg-gradient-to-r from-emerald-700 to-emerald-600"
            }`}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "rgba(0,0,0,1)",
            opacity: Math.min(0.9, Math.max(0, (Number(branding.heroOverlayOpacity || 0) || 0) / 100)),
          }}
        />
        <div className="mx-auto max-w-4xl px-2 text-center">
          <div className="relative">
            <h1 className="mb-5 text-4xl font-bold leading-tight md:text-5xl md:leading-tight">
              Welcome to {branding.name}
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg opacity-90 md:text-xl md:leading-relaxed">
              {branding.tagline}
            </p>
            <button
              onClick={(e) => handleSmoothScroll(e, "booking")}
              className="cursor-pointer rounded-xl bg-amber-500 px-10 py-3.5 font-semibold shadow-lg shadow-black/20 transition hover:bg-amber-600"
            >
              Book Now
            </button>
          </div>
        </div>
      </section>

      {/* Rooms Section */}
      <section id="rooms" className="px-4 py-20 sm:px-6 md:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2
            className={`mb-4 text-center text-3xl font-bold tracking-tight md:mb-6 md:text-4xl ${
              theme === "dark" ? "text-white" : "text-emerald-700"
            }`}
          >
            Our Rooms
          </h2>
          <p
            className={`mx-auto mb-14 max-w-2xl text-center text-sm leading-relaxed md:mb-16 md:text-base ${
              theme === "dark" ? "text-slate-400" : "text-gray-600"
            }`}
          >
            Choose an accommodation that fits your stay. Tap a room for photos and details.
          </p>
          {loadingRooms ? (
            <div className="grid gap-10 md:grid-cols-2 md:gap-10 lg:grid-cols-3 lg:gap-12">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className={`group rounded-2xl shadow-lg overflow-hidden border animate-pulse ${
                  theme === "dark"
                    ? "bg-slate-800 border-slate-700"
                    : "bg-white border-emerald-50"
                }`}>
                  {/* Image Skeleton */}
                  <div className={`relative h-64 ${
                    theme === "dark" ? "bg-slate-700" : "bg-emerald-50"
                  }`}></div>
                  {/* Content Skeleton */}
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-2">
                      <div className={`h-6 w-3/4 rounded ${
                        theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                      }`}></div>
                      <div className={`h-5 w-16 rounded-full ${
                        theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                      }`}></div>
                    </div>
                    <div className={`h-8 w-1/2 rounded mb-4 ${
                      theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                    }`}></div>
                    <div className={`h-4 w-2/3 rounded mb-4 ${
                      theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                    }`}></div>
                    <div className="flex gap-2 mb-4">
                      <div className={`h-6 w-16 rounded-full ${
                        theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                      }`}></div>
                      <div className={`h-6 w-20 rounded-full ${
                        theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                      }`}></div>
                    </div>
                    <div className="flex gap-2">
                      <div className={`flex-1 h-10 rounded-lg ${
                        theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                      }`}></div>
                      <div className={`flex-1 h-10 rounded-lg ${
                        theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                      }`}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className={`text-center py-12 ${
              theme === "dark" ? "text-gray-400" : "text-gray-500"
            }`}>
              <p>No rooms available at the moment.</p>
            </div>
          ) : (
            <>
          <div className="grid gap-10 md:grid-cols-2 md:gap-10 lg:grid-cols-3 lg:gap-12">
                {paginatedRooms.map((room) => (
                  <RoomCard
                key={room.id}
                    room={room}
                    onViewDetails={() => setActiveRoom(room.id)}
                    onImageClick={(image) => setPreviewImage(image)}
                    theme={theme}
                  />
                ))}
              </div>
              {totalRoomPages > 1 && (
                <div className={`mt-12 flex flex-col items-center gap-4 text-sm md:flex-row md:justify-between ${
                  theme === "dark" ? "text-gray-300" : "text-gray-600"
                }`}>
                  <button
                    onClick={() => setRoomsPage((prev) => Math.max(1, prev - 1))}
                    disabled={roomsPage === 1}
                    className={`inline-flex items-center gap-2 rounded-full border px-6 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      theme === "dark"
                        ? "border-emerald-700 bg-slate-800 text-emerald-300 hover:border-emerald-600 hover:bg-slate-700 disabled:hover:bg-slate-800"
                        : "border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400 hover:bg-emerald-50 disabled:hover:bg-white"
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
                    className={`inline-flex items-center gap-2 rounded-full border px-6 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      theme === "dark"
                        ? "border-emerald-700 bg-slate-800 text-emerald-300 hover:border-emerald-600 hover:bg-slate-700 disabled:hover:bg-slate-800"
                        : "border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400 hover:bg-emerald-50 disabled:hover:bg-white"
                    }`}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Room Detail Modal */}
      {activeRoom && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8 transition-opacity duration-300 ${
            isModalClosing ? "opacity-0" : "opacity-100"
          }`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleModalClose()
            }
          }}
        >
          <div
            className={`relative h-[92vh] w-full max-w-4xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden lg:h-[85vh] lg:max-w-6xl lg:rounded-3xl lg:flex-row transition-all duration-300 ${
              theme === "dark"
                ? "bg-slate-800 ring-1 ring-slate-700"
                : "bg-white ring-1 ring-emerald-100"
            } ${
              isModalClosing
                ? "translate-y-full lg:translate-y-0 lg:scale-95 lg:opacity-0"
                : "translate-y-0 lg:scale-100 lg:opacity-100 animate-[slideUp_0.3s_ease-out] lg:animate-[fadeInScale_0.3s_ease-out]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {rooms
              .filter((r) => r.id === activeRoom)
              .map((room) => {
                const images = room.images?.length > 0 ? room.images : []
                return (
                  <div key={room.id} className="flex flex-col lg:flex-row h-full overflow-hidden">
                    {/* Close Button */}
                    <button
                      onClick={handleModalClose}
                      className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition hover:bg-gray-50 hover:scale-110"
                      aria-label="Close modal"
                      type="button"
                    >
                      <X size={18} />
                    </button>

                    {/* Image Section - Left side on desktop, top on mobile */}
                    {images.length > 0 ? (
                      <div className="relative w-full h-64 lg:h-full lg:w-2/5 flex-shrink-0">
                        <img
                          src={images[0]}
                          alt={room.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent lg:bg-gradient-to-r lg:from-black/60 lg:via-black/20 lg:to-transparent" />
                        {room.featured && (
                          <span className="absolute top-4 left-4 bg-amber-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
                            ⭐ Featured
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="relative w-full h-48 lg:h-full lg:w-2/5 flex-shrink-0 bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
                        {room.featured && (
                          <span className="absolute top-4 left-4 bg-amber-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
                            ⭐ Featured
                          </span>
                        )}
                        <div className="text-white text-center px-4">
                          <p className="text-lg font-bold">{room.name}</p>
                        </div>
                      </div>
                    )}

                    {/* Content Section - Right side on desktop, below image on mobile */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Content Area - Scrollable on mobile, fits on desktop */}
                      <div className="flex-1 overflow-y-auto lg:overflow-y-visible px-6 pb-4 pt-16 sm:px-8 sm:pt-12 lg:pt-12">
                        {/* Header */}
                        <header className="mb-4 lg:mb-6">
                          <p className="text-xs uppercase tracking-[0.35em] text-emerald-600 mb-2">Room Details</p>
                          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{room.name}</h2>
                          {!images.length && room.featured && (
                            <span className="inline-block bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                              ⭐ Featured
                            </span>
                          )}
                        </header>

                        {/* Desktop Layout - Two Columns */}
                        <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:h-full lg:content-between">
                          {/* Left Column */}
                          <div className="lg:flex lg:flex-col lg:justify-between">
                            {/* Price Section */}
                            <section className="mb-4 lg:mb-0 space-y-2 rounded-xl border border-gray-100 p-4 bg-gradient-to-br from-amber-50 to-emerald-50">
                              <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-600">Pricing</h3>
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-2xl lg:text-3xl font-bold text-amber-600">
                                  ₱{room.price?.toLocaleString() || 0}
                                </span>
                                <span className="text-gray-600 font-medium text-sm">/night</span>
                                {room.discount > 0 && (
                                  <>
                                    <span className="text-sm text-gray-500 line-through">
                                      ₱{Math.round((room.price * 100) / (100 - room.discount)).toLocaleString()}
                                    </span>
                                    <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-xs font-semibold">
                                      {room.discount}% OFF
                                    </span>
                                  </>
                                )}
                              </div>
                            </section>

                            {/* Room Info */}
                            <section className="mb-4 lg:mb-0 space-y-2 rounded-xl border border-gray-100 p-4">
                              <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-600">Information</h3>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg">
                                  <div className="bg-emerald-600 text-white rounded-full p-1.5 flex-shrink-0">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600">Max Guests</p>
                                    <p className="text-sm font-bold text-emerald-700">{room.maxGuests || 2}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                                  <div className="bg-blue-600 text-white rounded-full p-1.5 flex-shrink-0">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600">Status</p>
                                    <p className="text-sm font-bold text-blue-700">{room.availability || "Available"}</p>
                                  </div>
                                </div>
                              </div>
                            </section>
                          </div>

                          {/* Right Column */}
                          <div className="lg:flex lg:flex-col lg:justify-between">
                            {/* Description */}
                            {room.description && (
                              <section className="mb-4 lg:mb-0 space-y-2 rounded-xl border border-gray-100 p-4">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-600">Description</h3>
                                <p className="text-gray-600 leading-relaxed text-xs lg:text-sm line-clamp-4 lg:line-clamp-none">{room.description}</p>
                              </section>
                            )}

                            {/* Amenities */}
                            {room.amenities && room.amenities.length > 0 && (
                              <section className="mb-4 lg:mb-0 space-y-2 rounded-xl border border-gray-100 p-4">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-600">Amenities</h3>
                                <div className="grid grid-cols-2 lg:grid-cols-2 gap-2">
                                  {room.amenities.slice(0, 6).map((amenity, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-1.5 p-1.5 bg-emerald-50 rounded-lg border border-emerald-100"
                                    >
                                      <svg className="w-3 h-3 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      <span className="text-gray-700 font-medium text-xs truncate">{amenity}</span>
                                    </div>
                                  ))}
                                  {room.amenities.length > 6 && (
                                    <div className="flex items-center justify-center p-1.5 bg-gray-50 rounded-lg border border-gray-200">
                                      <span className="text-gray-600 font-medium text-xs">+{room.amenities.length - 6} more</span>
                                    </div>
                                  )}
                                </div>
                              </section>
                            )}

                            {/* Image Gallery - Only on desktop if space allows */}
                            {images.length > 1 && (
                              <section className="mb-4 lg:mb-0 space-y-2 rounded-xl border border-gray-100 p-4 hidden lg:block">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-600">Gallery</h3>
                                <div className="grid grid-cols-3 gap-2">
                                  {images.slice(1, 4).map((image, idx) => (
                                    <div
                                      key={idx}
                                      className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                                      onClick={() => setPreviewImage(image)}
                                    >
                                      <img
                                        src={image}
                                        alt={`${room.name} - Image ${idx + 2}`}
                                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                        <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={16} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            )}
                          </div>
                        </div>

                        {/* Mobile Image Gallery - Below content on mobile */}
                        {images.length > 1 && (
                          <section className="mb-4 space-y-2 rounded-xl border border-gray-100 p-4 lg:hidden">
                            <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-600">Gallery</h3>
                            <div className="grid grid-cols-3 gap-2">
                              {images.slice(1, 4).map((image, idx) => (
                                <div
                                  key={idx}
                                  className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                                  onClick={() => setPreviewImage(image)}
                                >
                                  <img
                                    src={image}
                                    alt={`${room.name} - Image ${idx + 2}`}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={16} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="border-t border-gray-100 bg-gray-50 p-4 lg:p-6 flex-shrink-0">
                        <div className="flex flex-col sm:flex-row gap-2 lg:gap-3">
                  <button
                            onClick={() => {
                              // Don't proceed if room is not available
                              const roomAvailability = room.availability?.trim() || room.availability
                              if (roomAvailability && roomAvailability !== "Available") {
                                return
                              }
                              setFormData((prev) => ({ ...prev, roomType: room.name }))
                              handleModalClose()
                              setTimeout(() => {
                                document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" })
                              }, 350)
                            }}
                            disabled={(() => {
                              const roomAvailability = room.availability?.trim() || room.availability
                              return roomAvailability && roomAvailability !== "Available"
                            })()}
                            className={`flex-1 rounded-xl px-4 py-2.5 lg:px-6 lg:py-3 font-semibold text-sm lg:text-base transition ${
                              (() => {
                                const roomAvailability = room.availability?.trim() || room.availability
                                const isAvailable = !roomAvailability || roomAvailability === "Available"
                                return isAvailable
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                                  : "bg-gray-300 text-gray-500 cursor-not-allowed opacity-60"
                              })()
                            }`}
                            title={(() => {
                              const roomAvailability = room.availability?.trim() || room.availability
                              if (roomAvailability && roomAvailability !== "Available") {
                                return `Room is currently ${roomAvailability.toLowerCase()}. Only available rooms can be booked.`
                              }
                              return ""
                            })()}
                          >
                            {(() => {
                              const roomAvailability = room.availability?.trim() || room.availability
                              const isAvailable = !roomAvailability || roomAvailability === "Available"
                              if (!isAvailable) {
                                return roomAvailability === "Maintenance" ? "Under Maintenance" : "Unavailable"
                              }
                              return "Book Now"
                            })()}
                          </button>
                  <button
                            onClick={handleModalClose}
                            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 lg:px-6 lg:py-3 font-semibold text-gray-700 text-sm lg:text-base transition hover:bg-gray-50 sm:flex-1"
                  >
                    Close
                  </button>
                </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition"
          >
            <X size={32} />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Booking Section */}
      <section
        id="booking"
        className={`px-4 py-20 sm:px-6 md:py-24 lg:px-8 ${
          theme === "dark" ? "bg-slate-800" : "bg-gray-50"
        }`}
      >
        <div className="mx-auto max-w-4xl">
          <h2
            className={`mb-3 text-center text-3xl font-bold tracking-tight md:text-4xl ${
              theme === "dark" ? "text-white" : "text-emerald-700"
            }`}
          >
            Book Your Stay
          </h2>
          <p
            className={`mx-auto mb-12 max-w-xl text-center text-sm md:mb-14 md:text-base ${
              theme === "dark" ? "text-slate-400" : "text-gray-600"
            }`}
          >
            Two quick steps: your details, then email verification.
          </p>
          <form
            onSubmit={handleBooking}
            className={`rounded-2xl p-6 shadow-xl sm:p-8 md:p-10 ${
              theme === "dark" ? "bg-slate-700/90 ring-1 ring-slate-600/60" : "bg-white ring-1 ring-gray-200/80"
            }`}
          >
            {!otpSent ? (
              <>
                {/* Step 1: Booking Form */}
                <div className="mb-8 border-b border-gray-200/80 pb-8 dark:border-slate-600/80">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-300">
                    Step 1 of 2 — Guest details
                  </p>
                </div>
                
            <div className="mb-8 grid gap-6 md:grid-cols-2 md:gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name *</label>
              <input
                type="text"
                      placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                required
              />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address *</label>
              <input
                type="email"
                      placeholder="your.email@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                required
              />
            </div>
                </div>
                
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number *</label>
              <input
                    type="tel"
                    placeholder="+63 912 345 6789"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                required
              />
                </div>
                
            <div className="mb-8 grid gap-6 md:grid-cols-2 md:gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Check-in Date *
                      {formData.roomType && bookedDates.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          ({bookedDates.length} date{bookedDates.length !== 1 ? "s" : ""} booked)
                        </span>
                      )}
                    </label>
                    <Popover open={checkInCalendarOpen} onOpenChange={setCheckInCalendarOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={`w-full p-3 border-2 rounded-lg focus:outline-none focus:ring-2 transition-colors text-left ${
                            !dateAvailability.available && formData.roomType && formData.checkIn
                              ? "border-red-400 bg-red-50 focus:ring-red-500"
                              : bookedDates.includes(formData.checkIn)
                              ? "border-red-400 bg-red-50 focus:ring-red-500"
                              : formData.checkIn && dateAvailability.available
                              ? "border-emerald-400 bg-emerald-50 focus:ring-emerald-500"
                              : "border-gray-300 focus:ring-emerald-700 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={formData.checkIn ? "text-gray-900" : "text-gray-500"}>
                              {formData.checkIn ? format(new Date(formData.checkIn + "T00:00:00"), "PPP") : "Select check-in date"}
                            </span>
                            <CalendarIcon className="h-4 w-4 text-gray-500" />
                          </div>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.checkIn ? new Date(formData.checkIn + "T00:00:00") : undefined}
                          onSelect={(date) => {
                            if (!date) return
                            // Format date in local timezone to avoid UTC conversion issues
                            const year = date.getFullYear()
                            const month = String(date.getMonth() + 1).padStart(2, "0")
                            const day = String(date.getDate()).padStart(2, "0")
                            const dateStr = `${year}-${month}-${day}`
                            
                            // Check if selected date is booked
                            if (bookedDates.includes(dateStr)) {
                              toast.error("⚠️ This date is already booked. Please select a different date.")
                              return
                            }
                            
                            setFormData({ ...formData, checkIn: dateStr, checkOut: "" })
                            setCheckInCalendarOpen(false)
                          }}
                          disabled={(date) => {
                            // Disable past dates
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            today.setMinutes(0, 0, 0)
                            if (date < today) return true
                            
                            // Disable booked dates - format date in local timezone
                            const year = date.getFullYear()
                            const month = String(date.getMonth() + 1).padStart(2, "0")
                            const day = String(date.getDate()).padStart(2, "0")
                            const dateStr = `${year}-${month}-${day}`
                            const isBooked = bookedDates.includes(dateStr)
                            
                            return isBooked
                          }}
                          modifiers={{
                            booked: bookedDates.map(d => {
                              // Parse date string and create date in local timezone
                              const [year, month, day] = d.split("-").map(Number)
                              const date = new Date(year, month - 1, day, 12, 0, 0) // Use local timezone
                              return date
                            }),
                          }}
                          modifiersClassNames={{
                            booked: "!bg-red-100 !text-red-800 line-through opacity-60 cursor-not-allowed hover:!bg-red-100",
                          }}
                          classNames={{
                            day_disabled: "opacity-50 cursor-not-allowed",
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {bookedDates.includes(formData.checkIn) && (
                      <p className="mt-1 text-xs text-red-600 font-semibold flex items-center gap-1">
                        <span>🔴</span> This date is already booked
                      </p>
                    )}
                    {formData.checkIn && dateAvailability.message && (
                      <p className={`mt-1 text-xs flex items-center gap-1 ${
                        dateAvailability.available ? "text-emerald-600" : "text-red-600"
                      }`}>
                        <span>{dateAvailability.available ? "✅" : "⚠️"}</span> {dateAvailability.message}
                      </p>
                    )}
            </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Check-out Date *</label>
                    <Popover open={checkOutCalendarOpen} onOpenChange={setCheckOutCalendarOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={!formData.checkIn}
                          className={`w-full p-3 border-2 rounded-lg focus:outline-none focus:ring-2 transition-colors text-left ${
                            !formData.checkIn
                              ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                              : !dateAvailability.available && formData.roomType && formData.checkIn && formData.checkOut
                              ? "border-red-400 bg-red-50 focus:ring-red-500"
                              : bookedDates.includes(formData.checkOut)
                              ? "border-red-400 bg-red-50 focus:ring-red-500"
                              : formData.checkOut && dateAvailability.available
                              ? "border-emerald-400 bg-emerald-50 focus:ring-emerald-500"
                              : "border-gray-300 focus:ring-emerald-700 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={formData.checkOut ? "text-gray-900" : "text-gray-500"}>
                              {formData.checkOut ? format(new Date(formData.checkOut + "T00:00:00"), "PPP") : "Select check-out date"}
                            </span>
                            <CalendarIcon className="h-4 w-4 text-gray-500" />
                          </div>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formData.checkOut ? new Date(formData.checkOut + "T00:00:00") : undefined}
                          onSelect={(date) => {
                            if (!date) return
                            // Format date in local timezone to avoid UTC conversion issues
                            const year = date.getFullYear()
                            const month = String(date.getMonth() + 1).padStart(2, "0")
                            const day = String(date.getDate()).padStart(2, "0")
                            const dateStr = `${year}-${month}-${day}`
                            
                            // Check if selected date is booked
                            if (bookedDates.includes(dateStr)) {
                              toast.error("⚠️ This date is already booked. Please select a different date.")
                              return
                            }
                            
                            // Validate check-out is after check-in
                            if (formData.checkIn && dateStr <= formData.checkIn) {
                              toast.error("Check-out date must be after check-in date.")
                              return
                            }
                            
                            setFormData({ ...formData, checkOut: dateStr })
                            setCheckOutCalendarOpen(false)
                          }}
                          disabled={(date) => {
                            // Disable past dates
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            if (date < today) return true
                            
                            // Disable dates before or equal to check-in
                            if (formData.checkIn) {
                              const checkInDate = new Date(formData.checkIn + "T00:00:00")
                              checkInDate.setHours(0, 0, 0, 0)
                              if (date <= checkInDate) return true
                            }
                            
                            // Disable booked dates - format date in local timezone
                            const year = date.getFullYear()
                            const month = String(date.getMonth() + 1).padStart(2, "0")
                            const day = String(date.getDate()).padStart(2, "0")
                            const dateStr = `${year}-${month}-${day}`
                            return bookedDates.includes(dateStr)
                          }}
                          modifiers={{
                            booked: bookedDates.map(d => {
                              // Parse date string and create date in local timezone
                              const [year, month, day] = d.split("-").map(Number)
                              const date = new Date(year, month - 1, day, 12, 0, 0) // Use local timezone
                              return date
                            }),
                          }}
                          modifiersClassNames={{
                            booked: "!bg-red-100 !text-red-800 line-through opacity-60 cursor-not-allowed hover:!bg-red-100",
                          }}
                          classNames={{
                            day_disabled: "opacity-50 cursor-not-allowed",
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {!formData.checkIn && (
                      <p className="mt-1 text-xs text-gray-500">Please select check-in date first</p>
                    )}
                    {bookedDates.includes(formData.checkOut) && (
                      <p className="mt-1 text-xs text-red-600 font-semibold flex items-center gap-1">
                        <span>🔴</span> This date is already booked
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Show booked date ranges */}
                {formData.roomType && bookedRanges.length > 0 && (
                  <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 md:p-5">
                    <p className="mb-3 text-xs font-semibold text-amber-800">
                      Already booked — {formData.roomType}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {bookedRanges.map((range, idx) => (
                        <span
                          key={idx}
                          className="inline-block rounded px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300"
                        >
                          {new Date(range.checkIn).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - {new Date(range.checkOut).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-amber-700">Please avoid these dates when booking.</p>
                  </div>
                )}
                
                {/* Date Availability Status */}
                {formData.roomType && formData.checkIn && formData.checkOut && (
                  <div className="mb-8">
                    {dateAvailability.checking ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"></div>
                        <span>Checking availability...</span>
                      </div>
                    ) : !dateAvailability.available ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <strong>⚠ Not Available:</strong> {dateAvailability.message}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                        <strong>✓ Available:</strong> These dates are available for booking.
                      </div>
                    )}
                  </div>
                )}
                
            <div className="mb-8 grid gap-6 md:grid-cols-2 md:gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Guests *</label>
              <input
                type="number"
                      min="1"
                      max="10"
                      placeholder="1"
                value={formData.guests}
                onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                required
              />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Room Type / Selection *</label>
              <select
                      name="roomType"
                value={formData.roomType}
                onChange={(e) => setFormData({ ...formData, roomType: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                required
              >
                <option value="">Select Room Type</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.name}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
                </div>
                
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Special Requests / Notes <span className="text-gray-500 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    placeholder="e.g., extra bed, early check-in, dietary preferences..."
                    value={formData.specialRequests}
                    onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                {/* Price summary */}
                {formData.roomType && basePrice > 0 && formData.checkIn && formData.checkOut && nights > 0 && (
                  <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">Price summary</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between">
                        <span>Price per night</span>
                        <span className="font-semibold">{formatPhp(pricePerNight)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex items-center justify-between text-xs text-emerald-700">
                          <span>Discount</span>
                          <span className="font-semibold">{discount}% off</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span>Nights</span>
                        <span className="font-semibold">{nights}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2">
                        <span className="font-semibold text-slate-900">Estimated total</span>
                        <span className="font-bold text-emerald-700">{formatPhp(estimatedTotal)}</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Final amount may change after admin review (discounts, adjustments, or room changes).
                      </p>
                    </div>
                  </div>
                )}

                {/* Payment (GCash QR) + uploads */}
                {paymentRequired && (
                <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">Step 2 of 3: Payment</p>
                  {paymentQrUrl ? (
                    <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,20rem)_1fr] md:items-start">
                      <div className="mx-auto w-full max-w-[20rem] md:mx-0">
                        <div className="group relative">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(paymentQrUrl)}
                            className="relative block w-full overflow-hidden rounded-xl border-2 border-emerald-200 bg-white p-2 shadow-sm transition hover:ring-2 hover:ring-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                            aria-label="View GCash QR full screen"
                          >
                            <img
                              src={paymentQrUrl}
                              alt="GCash QR code"
                              className="mx-auto h-60 w-60 object-contain md:h-80 md:w-80"
                            />
                          </button>
                          <div className="pointer-events-none absolute top-3 right-3 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="rounded-full bg-white/95 p-2 shadow-md">
                              <ZoomIn size={18} className="text-emerald-700" aria-hidden />
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 text-center text-xs text-emerald-800/80">Tap to preview full size</p>
                      </div>
                      <div className="text-sm text-emerald-900/90">
                        <p className="font-semibold">Scan to pay via GCash.</p>
                        <p className="mt-1 text-xs text-emerald-900/70">
                          After payment, upload your proof of payment and 1 valid ID below, then proceed to OTP.
                        </p>
                        {paymentInstructions ? (
                          <p className="mt-2 text-xs text-emerald-900/80">{paymentInstructions}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-emerald-900/80">
                      Payment QR is not available yet for this resort. Please contact the admin.
                    </p>
                  )}

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Proof of Payment *</label>
                      <label
                        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm transition ${
                          uploadingProof ? "opacity-60 cursor-not-allowed" : "hover:bg-emerald-50"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-emerald-900">
                          <Upload className="h-4 w-4" />
                          <span className="font-semibold">{proofOfPaymentUrl ? "Replace proof" : "Upload proof"}</span>
                        </span>
                        <span className="text-xs text-gray-500">{proofOfPaymentUrl ? "Uploaded" : "PNG/JPG"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingProof}
                          onChange={async (e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            setUploadingProof(true)
                            try {
                              const url = await uploadGuestFile(f)
                              setProofOfPaymentUrl(url)
                              toast.success("Proof of payment uploaded.")
                            } catch (err) {
                              console.error(err)
                              toast.error(err?.message || "Failed to upload proof of payment.")
                            } finally {
                              setUploadingProof(false)
                              e.target.value = ""
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {proofOfPaymentUrl ? (
                        <div className="mt-3 space-y-2">
                          <div className="group relative overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
                            <button
                              type="button"
                              onClick={() => setPreviewImage(proofOfPaymentUrl)}
                              className="block h-44 w-full focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                              aria-label="View proof of payment full screen"
                            >
                              <img
                                src={proofOfPaymentUrl}
                                alt="Proof of payment"
                                className="h-44 w-full cursor-pointer object-cover transition hover:opacity-95"
                              />
                            </button>
                            <div className="pointer-events-none absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <div className="rounded-full bg-white/95 p-2 shadow-md">
                                <ZoomIn size={18} className="text-emerald-700" aria-hidden />
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-emerald-800/90">Tap image to preview full size</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500">Upload a screenshot/photo of your payment.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">1 Valid ID *</label>
                      <label
                        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm transition ${
                          uploadingId ? "opacity-60 cursor-not-allowed" : "hover:bg-emerald-50"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-emerald-900">
                          <Upload className="h-4 w-4" />
                          <span className="font-semibold">{validIdUrl ? "Replace ID" : "Upload valid ID"}</span>
                        </span>
                        <span className="text-xs text-gray-500">{validIdUrl ? "Uploaded" : "PNG/JPG"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingId}
                          onChange={async (e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            setUploadingId(true)
                            try {
                              const url = await uploadGuestFile(f)
                              setValidIdUrl(url)
                              toast.success("Valid ID uploaded.")
                            } catch (err) {
                              console.error(err)
                              toast.error(err?.message || "Failed to upload valid ID.")
                            } finally {
                              setUploadingId(false)
                              e.target.value = ""
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {validIdUrl ? (
                        <div className="mt-3 space-y-2">
                          <div className="group relative overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
                            <button
                              type="button"
                              onClick={() => setPreviewImage(validIdUrl)}
                              className="block h-44 w-full focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                              aria-label="View valid ID full screen"
                            >
                              <img
                                src={validIdUrl}
                                alt="Valid ID"
                                className="h-44 w-full cursor-pointer object-cover transition hover:opacity-95"
                              />
                            </button>
                            <div className="pointer-events-none absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <div className="rounded-full bg-white/95 p-2 shadow-md">
                                <ZoomIn size={18} className="text-emerald-700" aria-hidden />
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-emerald-800/90">Tap image to preview full size</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500">Upload 1 government ID (photo).</p>
                      )}
                    </div>
                  </div>
                </div>
                )}
                
                {/* reCAPTCHA */}
                {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && (
                  <div className="mb-8 flex justify-center">
                    <ReCAPTCHA
                      ref={recaptchaRef}
                      sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                      onChange={(token) => setRecaptchaToken(token)}
                      onExpired={() => {
                        setRecaptchaToken(null)
                        toast.warning("reCAPTCHA expired. Please verify again.")
                      }}
                      onError={() => {
                        setRecaptchaToken(null)
                        toast.error("reCAPTCHA error. Please try again.")
                      }}
                    />
                  </div>
                )}
                
            <button
              type="submit"
                  disabled={
                    bookingSubmitting ||
                    (Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) && !recaptchaToken) ||
                    (paymentRequired && (!paymentQrUrl || !proofOfPaymentUrl || !validIdUrl)) ||
                    (formData.roomType && formData.checkIn && formData.checkOut && !dateAvailability.available)
                  }
                  className="mt-2 w-full rounded-xl bg-emerald-700 py-3.5 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
                  {bookingSubmitting ? "Sending OTP..." : "Send OTP Verification"}
            </button>

            {paymentRequired && (
              <div className="mt-5 space-y-1.5 text-xs text-gray-500">
                {!paymentQrUrl && <p>• Waiting for admin to upload a GCash QR code.</p>}
                {!proofOfPaymentUrl && <p>• Upload your proof of payment.</p>}
                {!validIdUrl && <p>• Upload 1 valid ID.</p>}
              </div>
            )}
              </>
            ) : (
              <>
                {/* Step 2: OTP Verification */}
                <div className="mb-8 border-b border-gray-200/80 pb-8 dark:border-slate-600/80">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-300">Step 2 of 2 — Email verification</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                    We sent a 6-digit code to <strong className="text-gray-800 dark:text-slate-200">{formData.email}</strong>
                  </p>
                </div>
                
                <div className="mb-2">
                  <label className="mb-2 block text-sm font-semibold text-gray-700">Enter OTP code *</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) => {
                      const newCode = e.target.value.replace(/\D/g, "")
                      setOtpCode(newCode)
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 text-center text-2xl font-bold tracking-widest"
                    required
                    disabled={otpVerifying}
                    autoComplete="off"
                  />
                  {otpVerifying && (
                    <div className="mt-3 text-center">
                      <div className="inline-flex items-center gap-2 text-emerald-700">
                        <Loader2 size={20} className="animate-spin" />
                        <span className="text-sm font-semibold">Verifying & Booking...</span>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false)
                      setOtpCode("")
                    }}
                    className="mt-2 text-sm text-emerald-700 hover:text-emerald-800 underline"
                    disabled={otpVerifying}
                  >
                    Change email or resend OTP
                  </button>
                </div>
              </>
            )}
            
          </form>
        </div>
      </section>

      {/* About Section */}
      <section
        id="about"
        className={`px-4 py-20 sm:px-6 md:py-24 lg:px-8 ${theme === "dark" ? "bg-slate-900" : ""}`}
      >
        <div className="mx-auto max-w-7xl">
          <h2
            className={`mb-4 text-center text-3xl font-bold tracking-tight md:mb-6 md:text-4xl ${
              theme === "dark" ? "text-white" : "text-emerald-700"
            }`}
          >
            About {branding.name}
          </h2>
          {String(branding.aboutBody || "").trim() ? (
            <p
              className={`mx-auto mb-12 max-w-2xl text-center text-base leading-relaxed md:mb-16 md:text-lg ${
                theme === "dark" ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {branding.aboutBody}
            </p>
          ) : null}
          <div className="grid gap-10 md:grid-cols-3 md:gap-8 lg:gap-10">
            {(Array.isArray(branding.aboutHighlights) && branding.aboutHighlights.length
              ? branding.aboutHighlights
              : BRANDING_DEFAULTS.aboutHighlights
            ).slice(0, 3).map((item, idx) => (
              <div key={idx} className={`rounded-2xl p-7 text-center md:p-8 ${
                theme === "dark"
                  ? "bg-gradient-to-br from-slate-800 to-slate-700"
                  : "bg-gradient-to-br from-emerald-50 to-emerald-100"
              }`}>
                <h3 className={`text-xl font-bold mb-3 ${
                  theme === "dark" ? "text-emerald-400" : "text-emerald-700"
                }`}>{item.title}</h3>
                <p className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact & location (single section — marketplace map when available) */}
      <section
        id="contact"
        className={`px-4 py-20 sm:px-6 md:py-24 lg:px-8 ${
          theme === "dark" ? "bg-slate-800" : "bg-gray-50"
        }`}
      >
        <div className="mx-auto max-w-6xl">
          <h2
            className={`mb-3 text-center text-3xl font-bold tracking-tight md:text-4xl ${
              theme === "dark" ? "text-white" : "text-emerald-700"
            }`}
          >
            Contact &amp; location
          </h2>
          <p
            className={`mx-auto mb-12 max-w-xl text-center text-sm md:mb-14 md:text-base ${
              theme === "dark" ? "text-slate-400" : "text-gray-600"
            }`}
          >
            {hasResortListingHint
              ? "Find us on the map when available, then use the details or form to get in touch."
              : "Reach the property directly or send a message below."}
          </p>

          {hasResortListingHint && (
            <div className="mb-12 md:mb-16">
              {(resortMarketplace.location || branding.address) && (
                <p
                  className={`mx-auto mb-6 max-w-2xl text-center text-base leading-relaxed md:mb-8 md:text-lg ${
                    theme === "dark" ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {resortMarketplace.location || branding.address}
                </p>
              )}
              {showMapEmbedCard && (
                <>
                  <div
                    className={`mx-auto max-w-5xl overflow-hidden rounded-2xl border shadow-lg ${
                      theme === "dark" ? "border-slate-600 bg-slate-900" : "border-gray-200 bg-white"
                    }`}
                  >
                    {mapIframe?.src ? (
                      <iframe
                        title={`Map — ${branding.name}`}
                        src={mapIframe.src}
                        className="h-[min(380px,50vh)] w-full border-0 sm:h-[min(440px,55vh)]"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        allowFullScreen
                      />
                    ) : resortMarketplace.mapsUrl ? (
                      <div
                        className={`flex flex-col items-center justify-center gap-5 px-6 py-16 text-center ${
                          theme === "dark" ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        <MapPin className={theme === "dark" ? "text-emerald-400" : "text-emerald-700"} size={40} />
                        <p className="max-w-md text-sm leading-relaxed">
                          Live preview isn&apos;t embedded here. Use{" "}
                          <strong className="text-gray-800 dark:text-slate-200">Get directions</strong> below for
                          Google Maps navigation, or open your saved map link.
                        </p>
                        <a
                          href={resortMarketplace.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${
                            theme === "dark"
                              ? "text-emerald-300 ring-1 ring-emerald-600/80 hover:bg-slate-800"
                              : "text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
                          }`}
                        >
                          Open original Maps link
                        </a>
                      </div>
                    ) : null}
                  </div>
                  {mapIframe?.provider === "osm" && (
                    <p className={`mt-3 text-center text-xs ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                      Preview © OpenStreetMap (approximate). Use the green button below for Google driving directions.
                    </p>
                  )}
                </>
              )}
              {googleDirectionsUrl && (
                <div className="mt-8 flex justify-center md:mt-10">
                  <a
                    href={googleDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-emerald-800"
                  >
                    <Navigation className="h-5 w-5 shrink-0" aria-hidden />
                    Get directions in Google Maps
                  </a>
                </div>
              )}
            </div>
          )}

          {!hasResortListingHint && bookingOwnerUid && googleDirectionsUrl && (
            <div className="mb-12 flex justify-center md:mb-14">
              <a
                href={googleDirectionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-7 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-emerald-800"
              >
                <Navigation className="h-5 w-5 shrink-0" aria-hidden />
                Get directions in Google Maps
              </a>
            </div>
          )}

          <div className="grid gap-12 md:grid-cols-2 md:gap-14 lg:gap-16">
            <div className={`rounded-2xl p-6 md:p-8 ${theme === "dark" ? "bg-slate-900/50 ring-1 ring-slate-600/50" : "bg-white ring-1 ring-gray-200/90 shadow-sm"}`}>
              <div className="mb-8 flex items-start gap-4">
                <MapPin className={`mt-0.5 shrink-0 ${
                  theme === "dark" ? "text-emerald-400" : "text-emerald-700"
                }`} size={24} />
                <div>
                  <h3 className={`font-bold ${
                    theme === "dark" ? "text-white" : "text-gray-800"
                  }`}>Address</h3>
                  <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                    {resortMarketplace.location ||
                      branding.address ||
                      "123 Luxury Avenue, City Center"}
                  </p>
                </div>
              </div>
              <div className="mb-8 flex items-start gap-4">
                <Phone className={`mt-0.5 shrink-0 ${
                  theme === "dark" ? "text-emerald-400" : "text-emerald-700"
                }`} size={24} />
                <div>
                  <h3 className={`font-bold ${
                    theme === "dark" ? "text-white" : "text-gray-800"
                  }`}>Phone</h3>
                  <a href={`tel:${branding.phone || "+1 (555) 123-4567"}`} className={`transition ${
                    theme === "dark"
                      ? "text-gray-400 hover:text-emerald-400"
                      : "text-gray-600 hover:text-emerald-700"
                  }`}>
                    {branding.phone || "+1 (555) 123-4567"}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Mail className={`mt-0.5 shrink-0 ${
                  theme === "dark" ? "text-emerald-400" : "text-emerald-700"
                }`} size={24} />
                <div>
                  <h3 className={`font-bold ${
                    theme === "dark" ? "text-white" : "text-gray-800"
                  }`}>Email</h3>
                  <a href={`mailto:${branding.email || "info@luxestay.com"}`} className={`transition ${
                    theme === "dark"
                      ? "text-gray-400 hover:text-emerald-400"
                      : "text-gray-600 hover:text-emerald-700"
                  }`}>
                    {branding.email || "info@luxestay.com"}
                  </a>
                </div>
              </div>
            </div>
            <form
              onSubmit={handleContact}
              className={`space-y-5 rounded-2xl p-6 md:p-8 ${
                theme === "dark"
                  ? "bg-slate-900/40 ring-1 ring-slate-600/40"
                  : "bg-white ring-1 ring-gray-200/90 shadow-sm"
              }`}
            >
              <input
                type="text"
                placeholder="Your Name"
                value={contact.name}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 ${
                  theme === "dark"
                    ? "border-slate-600 bg-slate-700 text-white focus:ring-emerald-400"
                    : "border-gray-300 focus:ring-emerald-700"
                }`}
                required
              />
              <input
                type="email"
                placeholder="Your Email"
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 ${
                  theme === "dark"
                    ? "border-slate-600 bg-slate-700 text-white focus:ring-emerald-400"
                    : "border-gray-300 focus:ring-emerald-700"
                }`}
                required
              />
              <textarea
                placeholder="Your Message"
                value={contact.message}
                onChange={(e) => setContact({ ...contact, message: e.target.value })}
                rows={4}
                className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 ${
                  theme === "dark"
                    ? "border-slate-600 bg-slate-700 text-white focus:ring-emerald-400"
                    : "border-gray-300 focus:ring-emerald-700"
                }`}
                required
              />
              <button
                type="submit"
                disabled={contactSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3.5 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {contactSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                <Send size={20} /> Send Message
                  </>
              )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Feedback Section */}
      <section
        className={`px-4 py-20 sm:px-6 md:py-24 lg:px-8 ${theme === "dark" ? "bg-slate-900" : ""}`}
      >
        <div className="mx-auto max-w-7xl">
          <h2
            className={`mb-3 text-center text-3xl font-bold tracking-tight md:text-4xl ${
              theme === "dark" ? "text-white" : "text-emerald-700"
            }`}
          >
            Guest Feedback
          </h2>
          <p
            className={`mx-auto mb-12 max-w-xl text-center text-sm md:mb-14 md:text-base ${
              theme === "dark" ? "text-slate-400" : "text-gray-600"
            }`}
          >
            What visitors say about their stay.
          </p>
          {feedbacks.length === 0 ? (
            <div className="text-center py-12 mb-12">
              <p className={`text-lg ${
                theme === "dark" ? "text-gray-400" : "text-gray-500"
              }`}>No feedback available</p>
            </div>
          ) : (
            <div className="relative mb-12">
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-500 ease-in-out"
                  style={{
                    transform: `translateX(-${currentFeedbackIndex * (100 / 3)}%)`,
                  }}
                >
            {feedbacks.map((fb) => (
                    <div
                      key={fb.id}
                      className="flex-shrink-0 w-full md:w-1/3 px-4"
                      style={{ minWidth: "33.333%" }}
                    >
                      <div className={`p-6 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105 h-full ${
                        theme === "dark"
                          ? "bg-slate-800 border border-slate-700"
                          : "bg-white border border-gray-100"
                      }`}>
                <div className="flex items-center mb-4">
                          {[...Array(fb.rating || 5)].map((_, i) => (
                    <Star key={i} size={18} className="text-amber-500 fill-amber-500" />
                  ))}
                </div>
                        <p className={`mb-4 line-clamp-4 ${
                          theme === "dark" ? "text-gray-300" : "text-gray-700"
                        }`}>"{fb.message || fb.text}"</p>
                <p className={`font-bold ${
                  theme === "dark" ? "text-emerald-400" : "text-emerald-700"
                }`}>{fb.name}</p>
                      </div>
              </div>
            ))}
          </div>
              </div>
              
              {/* Navigation dots */}
              {feedbacks.length > 3 && (
                <div className="flex justify-center gap-2 mt-6">
                  {Array.from({ length: Math.ceil(feedbacks.length / 3) }).map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentFeedbackIndex(index * 3)}
                      className={`h-2 rounded-full transition-all ${
                        Math.floor(currentFeedbackIndex / 3) === index
                          ? "bg-emerald-700 w-8"
                          : "bg-gray-300 w-2"
                      }`}
                      aria-label={`Go to feedback set ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          <div
            className={`mx-auto mt-4 max-w-2xl rounded-2xl p-8 md:p-10 ${
              theme === "dark"
                ? "bg-gradient-to-r from-slate-800 to-slate-700 ring-1 ring-slate-600/40"
                : "bg-gradient-to-r from-emerald-50 to-emerald-100 ring-1 ring-emerald-100/80"
            }`}
          >
            <h3
              className={`mb-8 text-center text-xl font-bold md:text-2xl ${
                theme === "dark" ? "text-white" : "text-emerald-700"
              }`}
            >
              Share your feedback
            </h3>
            <form onSubmit={handleFeedback} className="space-y-5">
              <input
                type="text"
                placeholder="Your Name"
                value={feedback.name}
                onChange={(e) => setFeedback({ ...feedback, name: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                required
              />
              <input
                type="email"
                placeholder="Your Email"
                value={feedback.email}
                onChange={(e) => setFeedback({ ...feedback, email: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                required
              />
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Rating</label>
                <select
                  value={feedback.rating}
                  onChange={(e) => setFeedback({ ...feedback, rating: Number.parseInt(e.target.value) })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  {[1, 2, 3, 4, 5].map((num) => (
                    <option key={num} value={num}>
                      {num} Star{num !== 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Your Feedback"
                value={feedback.message}
                onChange={(e) => setFeedback({ ...feedback, message: e.target.value })}
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                required
              />
              <button
                type="submit"
                disabled={feedbackSubmitting}
                className="w-full bg-emerald-700 text-white py-3 rounded-lg hover:bg-emerald-800 transition font-semibold flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {feedbackSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" /> Submitting...
                  </>
                ) : (
                  "Submit Feedback"
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-12 px-4 sm:px-6 lg:px-8 text-white ${
        theme === "dark" ? "bg-slate-900" : "bg-emerald-800"
      }`}>
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <BrandLogo
                  className="h-10 w-10 rounded-full object-cover border border-emerald-600 bg-emerald-700"
                  textClassName="text-emerald-100"
                />
                <h4 className="font-bold text-lg">{branding.name}</h4>
              </div>
              <p className="text-emerald-100">{branding.tagline}</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-emerald-100">
                <li>
                  <a
                    href="#home"
                    onClick={(e) => handleSmoothScroll(e, "home")}
                    className="hover:text-white transition cursor-pointer"
                  >
                    Home
                  </a>
                </li>
                <li>
                  <a
                    href="#rooms"
                    onClick={(e) => handleSmoothScroll(e, "rooms")}
                    className="hover:text-white transition cursor-pointer"
                  >
                    Rooms
                  </a>
                </li>
                <li>
                  <a
                    href="#booking"
                    onClick={(e) => handleSmoothScroll(e, "booking")}
                    className="hover:text-white transition cursor-pointer"
                  >
                    Booking
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Support</h4>
              <ul className="space-y-2 text-emerald-100">
                <li>
                  <a
                    href="#contact"
                    onClick={(e) => handleSmoothScroll(e, "contact")}
                    className="hover:text-white transition cursor-pointer"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <a
                    href="#contact"
                    onClick={(e) => handleSmoothScroll(e, "contact")}
                    className="hover:text-white transition cursor-pointer"
                  >
                    FAQ
                  </a>
                </li>
                <li>
                  <a 
                    href="#contact" 
                    onClick={(e) => handleSmoothScroll(e, "contact")}
                    className="hover:text-white transition cursor-pointer"
                  >
                    Terms
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Follow Us</h4>
              <div className="flex space-x-4 mb-4">
                {branding.facebook && (
                  <a href={branding.facebook} target="_blank" rel="noopener noreferrer" className="bg-emerald-700 p-2 rounded hover:bg-emerald-600 transition">
                  f
                </a>
                )}
                {branding.twitter && (
                  <a href={branding.twitter} target="_blank" rel="noopener noreferrer" className="bg-emerald-700 p-2 rounded hover:bg-emerald-600 transition">
                  𝕏
                </a>
                )}
                {branding.linkedin && (
                  <a href={branding.linkedin} target="_blank" rel="noopener noreferrer" className="bg-emerald-700 p-2 rounded hover:bg-emerald-600 transition">
                  in
                </a>
                )}
                {!branding.facebook && !branding.twitter && !branding.linkedin && (
                  <p className="text-emerald-100 text-sm">No social links configured</p>
                )}
              </div>
              {/* PWA Install Button */}
              <PWAInstallButton variant="footer" />
            </div>
          </div>
          <div className="border-t border-emerald-700 pt-8 text-center text-emerald-100">
            <p>&copy; 2025 {branding.name}. All rights reserved.</p>
          </div>
        </div>
      </footer>
      
      {/* PWA Install Banner (Fixed Bottom) */}
      <PWAInstallButton variant="footer-banner" />
      <Toaster position="top-center" richColors />
    </div>
  )
}
