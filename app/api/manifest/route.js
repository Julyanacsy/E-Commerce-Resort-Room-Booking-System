import { NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"

const BRANDING_DOC_ID = "branding"
const BRANDING_COLLECTION = "settings"

const BRANDING_DEFAULTS = {
  name: "BayRest",
  shortName: "BayRest",
  logo: "/icon.svg",
  favicon: "/icon.svg",
}

/** PWA manifest icons must be valid & fetchable; Facebook CDN URLs often 403 in the browser. */
function manifestIconSrc(value) {
  const s = String(value || "").trim()
  if (!s) return "/icon.svg"
  if (/facebook\.com|fbcdn\.net/i.test(s)) return "/icon.svg"
  return s
}

export async function GET() {
  try {
    // Fetch branding from Firestore
    let branding = BRANDING_DEFAULTS
    
    try {
      const brandingRef = doc(db, BRANDING_COLLECTION, BRANDING_DOC_ID)
      const brandingSnap = await getDoc(brandingRef)
      
      if (brandingSnap.exists()) {
        const data = brandingSnap.data()
        const name = data.name === "LuxeStay" ? BRANDING_DEFAULTS.name : data.name || BRANDING_DEFAULTS.name
        const rawLogo = data.logo || data.favicon || BRANDING_DEFAULTS.logo
        const rawFav = data.favicon || data.logo || BRANDING_DEFAULTS.favicon
        branding = {
          name,
          shortName: name.split(" ")[0] || BRANDING_DEFAULTS.shortName,
          logo: manifestIconSrc(rawLogo),
          favicon: manifestIconSrc(rawFav),
        }
      }
    } catch (error) {
      console.error("Error fetching branding from Firestore:", error)
      // Use defaults if fetch fails
    }

    // Generate dynamic manifest
    const manifest = {
      name: `${branding.name} - Ecommerce Resort Room Booking`,
      short_name: branding.shortName,
      description: `${branding.name} - Ecommerce Resort Room Booking`,
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#059669",
      orientation: "portrait-primary",
      icons: [
        {
          src: branding.favicon || branding.logo || "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
        {
          src: branding.favicon || branding.logo || "/apple-icon.png",
          sizes: "180x180",
          type: branding.favicon?.endsWith(".svg") ? "image/svg+xml" : "image/png",
          purpose: "any",
        },
        {
          src: branding.favicon || branding.logo || "/icon.svg",
          sizes: "192x192",
          type: branding.favicon?.endsWith(".svg") ? "image/svg+xml" : "image/png",
          purpose: "any",
        },
        {
          src: branding.favicon || branding.logo || "/icon.svg",
          sizes: "512x512",
          type: branding.favicon?.endsWith(".svg") ? "image/svg+xml" : "image/png",
          purpose: "any",
        },
      ],
      categories: ["travel", "business"],
      screenshots: [],
      shortcuts: [
        {
          name: "Book Now",
          short_name: "Book",
          description: "Make a new booking",
          url: "/#booking",
          icons: [{ 
            src: branding.favicon || branding.logo || "/icon.svg", 
            sizes: "192x192",
            type: branding.favicon?.endsWith(".svg") ? "image/svg+xml" : "image/png",
          }],
        },
        {
          name: "Admin Dashboard",
          short_name: "Admin",
          description: "Access admin panel",
          url: "/admin",
          icons: [{ 
            src: branding.favicon || branding.logo || "/icon.svg", 
            sizes: "192x192",
            type: branding.favicon?.endsWith(".svg") ? "image/svg+xml" : "image/png",
          }],
        },
      ],
    }

    return NextResponse.json(manifest, {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600, must-revalidate",
      },
    })
  } catch (error) {
    console.error("Error generating manifest:", error)
    // Return default manifest on error
    return NextResponse.json(
      {
        name: "BayRest - Ecommerce Resort Room Booking",
        short_name: "BayRest",
        description: "Ecommerce Resort Room Booking",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#059669",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/manifest+json",
        },
      }
    )
  }
}
