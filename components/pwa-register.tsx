"use client"

import { useEffect } from "react"
import { syncManager } from "@/lib/offline-storage"

export default function PWARegister() {
  useEffect(() => {
    // Make syncManager available globally for service worker
    if (typeof window !== "undefined") {
      window.syncManager = syncManager
    }

    // Dev: unregister any SW — stale caches often break Tailwind/`/_next/static` CSS after reload until server restart.
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          regs.forEach((reg) => void reg.unregister())
        })
        .catch(() => {})
      return
    }

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Register service worker with proper scope
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[PWA] ✅ Service Worker registered:", registration.scope)
          console.log("[PWA] Service Worker state:", registration.active?.state || "installing")

          // Check for updates
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                console.log("[PWA] Service Worker state changed:", newWorker.state)
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.log("[PWA] New service worker available")
                  // Optionally show update notification
                }
              })
            }
          })
        })
        .catch((error) => {
          console.error("[PWA] ❌ Service Worker registration failed:", error)
          console.error("[PWA] Error details:", {
            message: error.message,
            stack: error.stack,
          })
        })

      // Handle service worker messages
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "SYNC_OFFLINE_DATA") {
          // Trigger sync from client
          syncManager.sync()
        }
      })
    }

    // Request notification permission for PWA install prompt
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {
        // User denied or error
      })
    }
  }, [])

  return null
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    syncManager?: any
  }
}

