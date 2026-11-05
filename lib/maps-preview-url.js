const GOOGLE_MAP_HOSTS = new Set(["google.com", "www.google.com", "maps.google.com"])
const SHORT_MAP_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"])

function parseGoogleMapsUrl(value, allowShortLink = true) {
  const raw = String(value ?? "").trim()
  if (!raw) return null

  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error("Enter a valid Google Maps link.")
  }

  const host = url.hostname.toLowerCase()
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Google Maps links must use HTTPS.")
  }

  if (allowShortLink && SHORT_MAP_HOSTS.has(host)) {
    if (host === "goo.gl" && !url.pathname.toLowerCase().startsWith("/maps")) {
      throw new Error("Enter a Google Maps short link.")
    }
    return url
  }

  const isMapsHost = GOOGLE_MAP_HOSTS.has(host)
  const isMapPath = url.pathname.toLowerCase().startsWith("/maps")
  const hasMapQuery = ["q", "query", "ll", "destination"].some((key) => url.searchParams.has(key))
  if (!isMapsHost || (!isMapPath && !(host === "maps.google.com" && hasMapQuery))) {
    throw new Error("Use a Google Maps link.")
  }
  return url
}

function normalizeMapsValue(value) {
  return String(value ?? "").trim()
}

export async function resolveGoogleMapsUrl(value) {
  const url = parseGoogleMapsUrl(value)
  if (!url) return ""

  if (!SHORT_MAP_HOSTS.has(url.hostname.toLowerCase())) {
    return url.toString()
  }

  const response = await fetch(`/api/maps/resolve-short-link?url=${encodeURIComponent(url.toString())}`)
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || "Could not resolve the Google Maps short link.")
  }

  const resolvedUrl = parseGoogleMapsUrl(result.url, false)
  return resolvedUrl.toString()
}

export function getGoogleDirectionsUrl(rawValue, options = {}) {
  const value = normalizeMapsValue(rawValue)
  if (!value) return ""

  const { destinationLabel } = options
  let destination = destinationLabel ? String(destinationLabel).trim() : value
  try {
    const url = new URL(value)
    if (url.protocol === "https:") {
      destination =
        url.searchParams.get("q") ||
        url.searchParams.get("query") ||
        url.searchParams.get("destination") ||
        destination
    }
  } catch {
    // Treat plain addresses as a destination query.
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

export function getMapPreviewIframeSrc(rawValue) {
  const value = normalizeMapsValue(rawValue)
  if (!value) return ""

  let query = value
  try {
    const url = new URL(value)
    query =
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      url.searchParams.get("destination") ||
      url.searchParams.get("place") ||
      url.toString()
  } catch {
    // Treat plain addresses as a map search query.
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
}
