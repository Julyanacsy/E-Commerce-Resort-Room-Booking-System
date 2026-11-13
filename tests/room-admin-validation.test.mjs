import test from "node:test"
import assert from "node:assert/strict"
import { isValidRoomImages } from "../lib/room-admin-validation.mjs"

test("room updates may preserve existing images above current upload limits", () => {
  const legacyImage = `data:image/jpeg;base64,${"a".repeat(130_000)}`

  assert.equal(isValidRoomImages([legacyImage], [legacyImage]), true)
  assert.equal(isValidRoomImages([`${legacyImage}b`], [legacyImage]), false)
})

test("new room images must stay within count and size limits", () => {
  const validImage = `data:image/jpeg;base64,${"a".repeat(10)}`
  const oversizedImage = `data:image/jpeg;base64,${"a".repeat(130_000)}`

  assert.equal(isValidRoomImages([validImage]), true)
  assert.equal(isValidRoomImages([oversizedImage]), false)
  assert.equal(isValidRoomImages(Array(9).fill(validImage)), false)
})
