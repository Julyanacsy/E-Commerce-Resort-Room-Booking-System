export const MAX_GCASH_QR_DATA_URL_CHARS = 520_000
export const MAX_ROOM_IMAGE_DATA_URL_CHARS = 120_000

export function readFileAsDataURL(file) {
  if (!file) return Promise.resolve("")

  if (typeof file === "string") {
    return Promise.resolve(file)
  }

  if (typeof window === "undefined" || typeof FileReader === "undefined") {
    return Promise.reject(new Error("FileReader is not available in this environment."))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Failed to read file as a data URL."))
    reader.readAsDataURL(file)
  })
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Failed to decode image."))
    image.src = url
  })
}

export async function compressImageFileToDataUrl(file, options = {}) {
  if (!file) return ""

  const {
    maxWidth = 1600,
    maxHeight = 1200,
    quality = 0.82,
    mimeType = "image/jpeg",
    maxChars = Number.POSITIVE_INFINITY,
  } = options

  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Please choose an image file.")
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Image compression is not available in this environment.")
  }
  if (![maxWidth, maxHeight, maxChars].every((value) => value > 0)) {
    throw new Error("Image compression limits must be greater than zero.")
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImageFromUrl(objectUrl)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (!sourceWidth || !sourceHeight) {
      throw new Error("The selected image has invalid dimensions.")
    }

    const baseScale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1)
    let scale = baseScale

    for (let resizeAttempt = 0; resizeAttempt < 8; resizeAttempt += 1) {
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(sourceWidth * scale))
      canvas.height = Math.max(1, Math.round(sourceHeight * scale))

      const context = canvas.getContext("2d")
      if (!context) {
        throw new Error("Image compression is not available in this browser.")
      }

      if (mimeType.toLowerCase().includes("jpeg") || mimeType.toLowerCase().includes("jpg")) {
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const qualities = [...new Set([quality, 0.72, 0.62, 0.52, 0.42])]
      for (const candidateQuality of qualities) {
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (!result) {
                reject(new Error("Could not compress the selected image."))
                return
              }
              resolve(result)
            },
            mimeType,
            candidateQuality,
          )
        })
        const dataUrl = await readFileAsDataURL(blob)
        if (dataUrl.length <= maxChars) return dataUrl
      }

      scale *= 0.75
    }

    throw new Error("Image is still too large after compression. Choose a smaller image.")
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
