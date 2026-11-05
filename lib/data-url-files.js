/**
 * Client-side images stored in Firestore as `data:image/...;base64,...` strings.
 * Firebase Storage is not used (cost / optional product).
 */

/** GCash QR lives in `site/payment` with few other fields */
export const MAX_GCASH_QR_DATA_URL_CHARS = 450_000

/** Proof + ID share the booking document with many text fields */
export const MAX_GUEST_ATTACHMENT_DATA_URL_CHARS = 420_000

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not read image"))
    img.src = url
  })
}

/**
 * Resize + JPEG encode so the data URL fits Firestore booking payload limits.
 * Phone cameras produce huge files; we shrink before base64 — guests don't need to manually resize.
 */
export async function compressImageFileToDataUrl(file, maxChars = MAX_GUEST_ATTACHMENT_DATA_URL_CHARS) {
  if (!file.type.startsWith("image/")) {
    const raw = await readFileAsDataURL(file)
    if (raw.length > maxChars) {
      throw new Error(
        "File too large after encoding. For non-image attachments, use a smaller file.",
      )
    }
    return raw
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageFromUrl(objectUrl)
    let maxSide = 1800
    const qualities = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42]

    for (let attempt = 0; attempt < 12; attempt++) {
      for (const quality of qualities) {
        const dataUrl = await renderToJpegDataUrl(img, maxSide, quality)
        if (dataUrl.length <= maxChars) {
          return dataUrl
        }
      }
      if (maxSide <= 560) break
      maxSide = Math.round(maxSide * 0.72)
    }

    throw new Error(
      "Image is still too large after compressing. Try a clearer screenshot or a photo with less detail.",
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function renderToJpegDataUrl(img, maxSide, quality) {
  let w = img.naturalWidth || img.width
  let h = img.naturalHeight || img.height
  if (!w || !h) return Promise.reject(new Error("Invalid image dimensions"))

  const scale = Math.min(1, maxSide / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d")
  if (!ctx) return Promise.reject(new Error("Canvas not available"))
  ctx.drawImage(img, 0, 0, cw, ch)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image"))
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = reject
        reader.readAsDataURL(blob)
      },
      "image/jpeg",
      quality,
    )
  })
}
