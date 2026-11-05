import { NextResponse } from "next/server"

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"])
const MAPS_HOSTS = new Set(["google.com", "www.google.com", "maps.google.com"])
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 5

function isAllowedShortLink(url) {
  if (url.protocol !== "https:" || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  if (!SHORT_HOSTS.has(host)) return false
  return host !== "goo.gl" || url.pathname.toLowerCase().startsWith("/maps")
}

function isGoogleMapsUrl(url) {
  const host = url.hostname.toLowerCase()
  const hasMapQuery = ["q", "query", "ll", "destination"].some((key) => url.searchParams.has(key))
  if (isAllowedShortLink(url)) return true
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    MAPS_HOSTS.has(host) &&
    (url.pathname.toLowerCase().startsWith("/maps") || (host === "maps.google.com" && hasMapQuery))
  )
}

export async function GET(request) {
  const rawUrl = request.nextUrl.searchParams.get("url")
  let currentUrl

  try {
    currentUrl = new URL(String(rawUrl || ""))
  } catch {
    return NextResponse.json({ error: "Enter a valid Google Maps short link." }, { status: 400 })
  }

  if (!isAllowedShortLink(currentUrl)) {
    return NextResponse.json({ error: "Only Google Maps short links are supported." }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Resort-Booking-MapResolver/1.0" },
      })

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location")
        if (!location) {
          return NextResponse.json({ error: "Google Maps returned an invalid redirect." }, { status: 422 })
        }

        const nextUrl = new URL(location, currentUrl)
        if (!isGoogleMapsUrl(nextUrl)) {
          return NextResponse.json({ error: "The short link did not resolve to a Google Maps page." }, { status: 422 })
        }
        currentUrl = nextUrl
        continue
      }

      if (!response.ok || !isGoogleMapsUrl(currentUrl)) {
        return NextResponse.json({ error: "Could not resolve the Google Maps short link." }, { status: 422 })
      }

      return NextResponse.json({ url: currentUrl.toString() })
    }

    return NextResponse.json({ error: "Google Maps link has too many redirects." }, { status: 422 })
  } catch (error) {
    const timedOut = error?.name === "AbortError"
    console.error("Failed to resolve Google Maps short link", error)
    return NextResponse.json(
      { error: timedOut ? "Resolving the Google Maps link timed out." : "Failed to resolve the Google Maps link." },
      { status: 500 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
