/**
 * In-app map preview helpers.
 *
 * Regular https://www.google.com/maps/... URLs cannot be iframed on other sites:
 * Google sends X-Frame-Options / CSP frame-ancestors that block embedding, so
 * ?output=embed on a normal Maps URL often shows "refused to connect".
 *
 * What works:
 * - OpenStreetMap embed from coordinates parsed out of the Google link (no API key).
 * - Optional https://www.google.com/maps/embed/v1/place?key=...&q=... when
 *   NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY is set (Google Maps Embed API).
 */

/**
 * Parse lat/lng from a pasted Google Maps URL.
 * URLs often contain several coordinate pairs (viewport, route steps). We prefer:
 * 1) All `!3d…!4d…` blocks → pick the most precise (longest fractional digits), then last as tie-break.
 * 2) All `@lat,lng` segments → pick last (pin/camera at end is usually the place).
 * 3) `ll=` / `q=` query params.
 */
export function extractLatLngFromGoogleMapsUrl(raw) {
  let s = String(raw || "").trim()
  if (!s) return null

  try {
    s = decodeURIComponent(s)
  } catch {
    /* ignore */
  }

  function parsePair(latStr, lngStr) {
    const lat = Number.parseFloat(String(latStr))
    const lng = Number.parseFloat(String(lngStr))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return { lat, lng }
  }

  function precisionScore(a, b) {
    const fa = String(a).replace(/^-/, "")
    const fb = String(b).replace(/^-/, "")
    const dec = (x) => (x.includes(".") ? x.split(".")[1]?.length || 0 : 0)
    return dec(fa) + dec(fb)
  }

  // !3d<lat>!4d<lng> — often encodes the dropped pin (may appear multiple times)
  const placeMatches = [...s.matchAll(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/g)]
  if (placeMatches.length) {
    const parsed = placeMatches
      .map((m) => {
        const p = parsePair(m[1], m[2])
        return p ? { p, score: precisionScore(m[1], m[2]), idx: m.index } : null
      })
      .filter(Boolean)
    if (parsed.length) {
      parsed.sort((x, y) => {
        if (y.score !== x.score) return y.score - x.score
        return (y.idx ?? 0) - (x.idx ?? 0)
      })
      return parsed[0].p
    }
  }

  // /@lat,lng — often several (overview vs pin); last segment usually matches the dropped pin view
  const atLoose = [...s.matchAll(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/g)]
  if (atLoose.length) {
    const last = atLoose[atLoose.length - 1]
    const p = parsePair(last[1], last[2])
    if (p) return p
  }

  try {
    const u = new URL(s)
    const ll = u.searchParams.get("ll")
    if (ll && /^-?\d/.test(ll.trim())) {
      const parts = ll.split(/[,\s]+/).map((x) => Number.parseFloat(x.trim()))
      if (
        parts.length >= 2 &&
        Number.isFinite(parts[0]) &&
        Number.isFinite(parts[1])
      ) {
        const p = parsePair(String(parts[0]), String(parts[1]))
        if (p) return p
      }
    }
    const q = u.searchParams.get("q")
    if (q && /^-?\d/.test(q.trim())) {
      const parts = q.split(/[,\s]+/).map((x) => Number.parseFloat(x.trim()))
      if (
        parts.length >= 2 &&
        Number.isFinite(parts[0]) &&
        Number.isFinite(parts[1])
      ) {
        const p = parsePair(String(parts[0]), String(parts[1]))
        if (p) return p
      }
    }
  } catch {
    /* ignore */
  }

  return null
}

/**
 * Opens Google Maps with **Directions** (user chooses start point; destination is the resort).
 * Uses coordinates from the pasted Maps URL when possible; otherwise address or resort name.
 *
 * @param {string} mapsUrl — Resort admin’s Google Maps link (short or full)
 * @param {{ fallbackAddress?: string, fallbackLabel?: string }} [options]
 * @returns {string | null}
 */
export function getGoogleDirectionsUrl(mapsUrl, options = {}) {
  const raw = String(mapsUrl || "").trim()
  const fallbackAddress = String(options.fallbackAddress || "").trim()
  const fallbackLabel = String(options.fallbackLabel || "").trim()

  const ll = extractLatLngFromGoogleMapsUrl(raw)
  let destination = ""
  if (ll) {
    destination = `${ll.lat},${ll.lng}`
  } else if (fallbackAddress) {
    destination = fallbackAddress
  } else if (fallbackLabel) {
    destination = fallbackLabel
  } else if (raw) {
    destination = raw
  }

  if (!destination) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {number} [spanDegrees] — half-box width; smaller = more zoom (default ~350 m across PH latitudes)
 * @returns {string}
 */
export function getOpenStreetMapEmbedUrl(lat, lng, spanDegrees = 0.004) {
  const half = spanDegrees / 2
  const minLat = lat - half
  const maxLat = lat + half
  const minLng = lng - half
  const maxLng = lng + half
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik`
}

/**
 * @param {string} mapsUrl
 * @param {string} apiKey
 */
export function getGoogleMapsEmbedApiIframeSrc(mapsUrl, apiKey) {
  const key = String(apiKey || "").trim()
  const raw = String(mapsUrl || "").trim()
  if (!key || !raw) return null
  const ll = extractLatLngFromGoogleMapsUrl(raw)
  // Pin-level: lat,lng geocodes tighter than pasting the whole URL string as `q`
  const q = ll ? `${ll.lat},${ll.lng}` : raw
  let url = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`
  if (ll) {
    url += "&zoom=18"
  }
  return url
}

/**
 * @param {string} mapsUrl
 * @returns {{ src: string, provider: 'google' | 'osm' } | null}
 */
export function getMapPreviewIframeSrc(mapsUrl) {
  const raw = String(mapsUrl || "").trim()
  if (!raw) return null

  const embedKey =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY || "" : ""
  if (embedKey) {
    const src = getGoogleMapsEmbedApiIframeSrc(raw, embedKey)
    if (src) return { src, provider: "google" }
  }

  const ll = extractLatLngFromGoogleMapsUrl(raw)
  if (ll) {
    return {
      src: getOpenStreetMapEmbedUrl(ll.lat, ll.lng, 0.004),
      provider: "osm",
    }
  }

  return null
}
