"use client"

import { useState, useEffect } from "react"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export default function PWAInstallButton({ variant = "default", className = "" }: { variant?: "default" | "sidebar" | "footer" | "footer-banner", className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  /** Session dismiss flag — only set after mount so SSR + first paint match (avoid hydration mismatch). */
  const [sessionDismissed, setSessionDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      console.log("[PWA Install] App is already installed")
      setIsInstalled(true)
      return
    }

    // Listen for beforeinstallprompt event - this is the key event for PWA install
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log("[PWA Install] ✅ beforeinstallprompt event fired - Install is available!")
      e.preventDefault() // Prevent the default browser install prompt
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
      console.log("[PWA Install] Deferred prompt saved, install button is now active")
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    
    // Debug: Log installability
    console.log("[PWA Install] Component mounted, checking installability...")
    console.log("[PWA Install] Standalone mode:", window.matchMedia("(display-mode: standalone)").matches)
    console.log("[PWA Install] Service worker support:", "serviceWorker" in navigator)
    console.log("[PWA Install] Waiting for beforeinstallprompt event...")
    
    // Check if we're on HTTPS
    const isHTTPS = window.location.protocol === 'https:' || window.location.hostname === 'localhost'
    console.log("[PWA Install] HTTPS:", isHTTPS)
    
    // Check manifest
    const manifestLink = document.querySelector('link[rel="manifest"]')
    console.log("[PWA Install] Manifest link found:", !!manifestLink)

    // Check if app is already installed
    const checkInstalled = () => {
      if (typeof window === 'undefined') return
      if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
        setIsInstalled(true)
        setShowBanner(false)
      }
    }

    checkInstalled()
    const interval = setInterval(checkInstalled, 1000)

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      }
      clearInterval(interval)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      console.log("[PWA Install] No deferred prompt available yet")
      console.log("[PWA Install] Checking PWA requirements...")
      
      // Check if service worker is registered
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        console.log("[PWA Install] Service Worker registered:", !!registration)
      }
      
      // Check if manifest is loaded
      const manifestLink = document.querySelector('link[rel="manifest"]')
      console.log("[PWA Install] Manifest link:", !!manifestLink)
      
      // For now, just log - don't show alert
      console.warn("[PWA Install] Install prompt not available. The browser will show it automatically when requirements are met.")
      console.warn("[PWA Install] Requirements: HTTPS, valid manifest, service worker, and user engagement")
      return
    }

    try {
      console.log("[PWA Install] Showing install prompt...")
      
      // Show install prompt
      await deferredPrompt.prompt()

      // Wait for user response
      const { outcome } = await deferredPrompt.userChoice

      console.log("[PWA Install] User choice:", outcome)

      if (outcome === "accepted") {
        console.log("[PWA] ✅ User accepted install prompt")
        setIsInstalled(true)
        setShowBanner(false)
        setDeferredPrompt(null)
      } else {
        console.log("[PWA] ❌ User dismissed install prompt")
        setDeferredPrompt(null)
      }
    } catch (error) {
      console.error("[PWA Install] Error showing prompt:", error)
      // Don't clear deferredPrompt on error, might be temporary
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    setSessionDismissed(true)
    try {
      sessionStorage.setItem("pwa-install-dismissed", "true")
    } catch {
      /* ignore */
    }
  }

  // Restore session dismissal after mount only (never read sessionStorage during SSR/render)
  useEffect(() => {
    try {
      if (sessionStorage.getItem("pwa-install-dismissed") === "true") {
        setShowBanner(false)
        setSessionDismissed(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Don't show if already installed
  if (isInstalled) {
    return null
  }

  if (variant === "sidebar") {
    return (
      <div className={`${className} ${showBanner ? "block" : "hidden"}`}>
        <button
          onClick={handleInstallClick}
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-all duration-200"
        >
          <Download size={16} />
          <span>Install App</span>
        </button>
      </div>
    )
  }

  if (variant === "footer") {
    return (
      <div className="mt-4">
        <button
          onClick={handleInstallClick}
          disabled={sessionDismissed}
          className={`w-full px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-md ${
            deferredPrompt && !sessionDismissed
              ? "bg-white text-emerald-700 hover:bg-emerald-50 cursor-pointer"
              : "bg-emerald-600/80 text-white hover:bg-emerald-600 cursor-pointer opacity-75"
          } ${sessionDismissed ? "opacity-50 cursor-not-allowed" : ""}`}
          title={
            deferredPrompt && !sessionDismissed
              ? "Click to install the app"
              : "Install will be available when browser prompts (requires HTTPS)"
          }
        >
          <Download size={18} />
          <span>Install App</span>
        </button>
        <p className="text-xs text-emerald-200 mt-2 text-center">
          {deferredPrompt && !sessionDismissed
            ? "Get quick access and work offline"
            : "Install available when browser prompts"}
        </p>
      </div>
    )
  }

  if (variant === "footer-banner") {
    if (sessionDismissed || !showBanner || !deferredPrompt) return null
    
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-emerald-700 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex-1 text-center sm:text-left">
            <p className="font-semibold text-sm">Install LuxeStay App</p>
            <p className="text-xs text-emerald-100">Get quick access and work offline</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleInstallClick}
              className="bg-white text-emerald-700 hover:bg-emerald-50"
              size="sm"
            >
              <Download size={16} className="mr-2" />
              Install
            </Button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-emerald-600 rounded transition-colors"
              aria-label="Dismiss"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Default variant
  return (
    <>
      {showBanner && deferredPrompt && (
        <Button
          onClick={handleInstallClick}
          className={className}
          variant="default"
        >
          <Download size={16} className="mr-2" />
          Install App
        </Button>
      )}
    </>
  )
}

