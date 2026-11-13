const MAX_ROOM_IMAGE_CHARS = 120_000
const MAX_ROOM_IMAGES_TOTAL_CHARS = 950_000

export function isValidRoomImages(images, existingImages = []) {
  if (!Array.isArray(images)) return false

  const unchangedImages = Array.isArray(existingImages)
    && images.length === existingImages.length
    && images.every((image, index) => image === existingImages[index])
  if (unchangedImages) return true

  return images.length <= 8
    && images.every((image) => typeof image === "string" && image.length <= MAX_ROOM_IMAGE_CHARS)
    && images.reduce((total, image) => total + image.length, 0) <= MAX_ROOM_IMAGES_TOTAL_CHARS
}
