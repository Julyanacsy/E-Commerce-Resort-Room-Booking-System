export const MAX_DESTINATION_HIGHLIGHTS = 5
export const MAX_DESTINATION_HIGHLIGHT_IMAGE_CHARS = 100_000
export const MAX_DESTINATION_HIGHLIGHT_IMAGES_TOTAL_CHARS = 500_000

export function getDestinationHighlightTitle(value, fallback = "Resort highlight") {
  const title = typeof value === "string" ? value.trim() : ""
  if (!title) return fallback

  const digitCount = (title.match(/\d/g) || []).length
  const letterCount = (title.match(/[a-z]/gi) || []).length
  const looksLikeFilename =
    /\.(?:jpe?g|png|webp|gif|avif)$/i.test(title)
    || /^(?:img|dsc|pxl|screenshot|image)[-_ ]?\d+/i.test(title)
    || (digitCount >= 12 && letterCount <= 2)

  return looksLikeFilename ? fallback : title
}

export function isValidDestinationHighlights(highlights) {
  if (!Array.isArray(highlights) || highlights.length > MAX_DESTINATION_HIGHLIGHTS) return false

  let totalImageChars = 0
  for (const highlight of highlights) {
    if (!highlight || typeof highlight !== "object" || Array.isArray(highlight)) return false
    if (Object.keys(highlight).some((key) => !["title", "description", "image"].includes(key))) return false
    if (typeof highlight.title !== "string" || !highlight.title.trim() || highlight.title.length > 100) return false
    if (typeof highlight.description !== "string" || highlight.description.length > 500) return false
    if (
      typeof highlight.image !== "string"
      || highlight.image.length > MAX_DESTINATION_HIGHLIGHT_IMAGE_CHARS
      || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(highlight.image)
    ) return false
    totalImageChars += highlight.image.length
  }

  return totalImageChars <= MAX_DESTINATION_HIGHLIGHT_IMAGES_TOTAL_CHARS
}
