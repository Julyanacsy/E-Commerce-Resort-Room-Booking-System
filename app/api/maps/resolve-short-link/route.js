import { NextResponse } from "next/server"

/**
 * Follows Google Maps short-link redirects server-side so we can build an embed URL.
 * Restricted hostnames only (SSRF-safe).
 */
function isAllowedShortMapsUrl(input) {
  try {
    const u = new URL(String(input).trim())
    if (u.protocol !== "https:") return false
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    if (host === "maps.app.goo.gl") return true
    if (host === "goo.gl" && u.pathname.toLowerCase().startsWith("/maps")) return true
    return false
  } catch {
    return false
  }
}

function looksLikeGoogleMapsPage(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:") return false
    const host = u.hostname.toLowerCase()
    if (!host.includes("google.")) return false
    return u.pathname.includes("/maps") || u.searchParams.has("q") || u.searchParams.has("ll")
  } catch {
    return false
  }
}

export async function GET(request) {
  const raw = request.nextUrl.searchParams.get("url")
  if (!raw?.trim() || !isAllowedShortMapsUrl(raw)) {
    return NextResponse.json({ error: "Invalid or unsupported URL" }, { status: 400 })
  }

  const target = raw.trim()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)

  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Resort-Booking-MapResolver/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Link returned an error" }, { status: 422 })
    }

    const finalUrl = res.url
    if (!finalUrl || !looksLikeGoogleMapsPage(finalUrl)) {
      return NextResponse.json({ error: "Could not resolve to a Google Maps URL" }, { status: 422 })
    }

    return NextResponse.json({ url: finalUrl })
  } catch (e) {
    const aborted = e?.name === "AbortError"
    return NextResponse.json(
      { error: aborted ? "Resolve timed out" : "Failed to resolve link" },
      { status: 500 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
