export const ROOM_ITEM_TYPES = new Set(["supply", "appliance"])
export const ROOM_ITEM_CONDITIONS = new Set(["good", "damaged", "missing"])

export function validateRoomItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false
  const name = typeof item.name === "string" ? item.name.trim() : ""
  const category = typeof item.category === "string" ? item.category.trim() : ""
  return name.length > 0
    && name.length <= 120
    && category.length > 0
    && category.length <= 80
    && ROOM_ITEM_TYPES.has(item.itemType)
    && Number.isInteger(item.expectedQuantity)
    && item.expectedQuantity >= 1
    && item.expectedQuantity <= 1000
}

export function validateInspectionEntries(entries, roomItems) {
  if (!Array.isArray(entries) || !Array.isArray(roomItems) || entries.length !== roomItems.length) {
    return false
  }
  const expectedItems = new Map(roomItems.map((item) => [item.id, item]))
  const seen = new Set()
  return entries.every((entry) => {
    const expected = expectedItems.get(entry?.itemId)
    if (!expected || seen.has(entry.itemId)) return false
    seen.add(entry.itemId)
    return Number.isInteger(entry.quantity)
      && entry.quantity >= 0
      && entry.quantity <= expected.expectedQuantity
      && ROOM_ITEM_CONDITIONS.has(entry.condition)
      && typeof entry.note === "string"
      && entry.note.length <= 300
  })
}

export function getInspectionFindings(entries) {
  return entries.flatMap((entry) => {
    const restockQuantity = Math.max(0, entry.expectedQuantity - entry.quantity)
    const needsReplacement = entry.condition === "damaged" || entry.condition === "missing"
    if (!restockQuantity && !needsReplacement) return []
    return [{
      itemId: entry.itemId,
      name: entry.name,
      category: entry.category,
      restockQuantity,
      needsReplacement,
      condition: entry.condition,
    }]
  })
}
