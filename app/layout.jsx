import "./globals.css"
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google"

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
})

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-display",
  display: "swap",
})

import PWARegister from "@/components/pwa-register"
import OfflineIndicator from "@/components/offline-indicator"

export const metadata = {
  title: "LuxeStay - Luxury Hotel Booking",
  description: "Book your luxury hotel stay with LuxeStay. Premium accommodations with world-class service.",
  manifest: "/manifest.json",
  themeColor: "#059669",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LuxeStay",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <head>
        <link rel="manifest" href="/api/manifest" />
        <link rel="icon" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <meta name="theme-color" content="#059669" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="LuxeStay" />
      </head>
      <body className="antialiased text-foreground bg-background">
        <PWARegister />
        <OfflineIndicator />
        {children}
        {/* Toaster is handled in admin page and landing page separately */}
      </body>
    </html>
  )
}
