import assert from "node:assert/strict"
import test from "node:test"
import {
  getDestinationHighlightTitle,
  isValidDestinationHighlights,
  MAX_DESTINATION_HIGHLIGHTS,
  MAX_DESTINATION_HIGHLIGHT_IMAGE_CHARS,
} from "../lib/resort-highlights.mjs"

const image = `data:image/jpeg;base64,${"a".repeat(64)}`

test("destination carousel titles never expose uploaded image filenames", () => {
  assert.equal(getDestinationHighlightTitle("485704922 9525830924150749 22172624309185864", "Kamayan Resort"), "Kamayan Resort")
  assert.equal(getDestinationHighlightTitle("IMG_20261113.jpg", "Resort highlight"), "Resort highlight")
  assert.equal(getDestinationHighlightTitle("Hidden Falls", "Resort highlight"), "Hidden Falls")
})

test("destination highlights accept bounded uploaded photos and descriptions", () => {
  assert.equal(isValidDestinationHighlights([
    { title: "Hidden Falls", description: "A short walk from the resort.", image },
  ]), true)
})

test("destination highlights reject empty titles, non-image data, excessive counts, and oversized photos", () => {
  assert.equal(isValidDestinationHighlights([{ title: "", description: "", image }]), false)
  assert.equal(isValidDestinationHighlights([{ title: "Spot", description: "", image: "javascript:alert(1)" }]), false)
  assert.equal(isValidDestinationHighlights([{ title: "Spot", description: "", image, extra: "unexpected" }]), false)
  assert.equal(
    isValidDestinationHighlights(Array.from({ length: MAX_DESTINATION_HIGHLIGHTS + 1 }, (_, index) => ({
      title: `Spot ${index}`,
      description: "",
      image,
    }))),
    false,
  )
  assert.equal(
    isValidDestinationHighlights([{
      title: "Spot",
      description: "",
      image: `data:image/jpeg;base64,${"a".repeat(MAX_DESTINATION_HIGHLIGHT_IMAGE_CHARS)}`,
    }]),
    false,
  )
})
