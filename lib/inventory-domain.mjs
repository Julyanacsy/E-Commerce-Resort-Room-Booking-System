export function isLowStock(item) {
  const quantity = Number(item?.quantity)
  const threshold = Number(item?.lowStockThreshold)
  return Number.isFinite(quantity)
    && Number.isFinite(threshold)
    && quantity <= threshold
}

export function validateInventoryItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false
  const name = typeof item.name === "string" ? item.name.trim() : ""
  const category = typeof item.category === "string" ? item.category.trim() : ""
  return name.length > 0
    && name.length <= 120
    && category.length > 0
    && category.length <= 80
    && Number.isInteger(item.quantity)
    && item.quantity >= 0
    && item.quantity <= 1_000_000
    && Number.isInteger(item.lowStockThreshold)
    && item.lowStockThreshold >= 0
    && item.lowStockThreshold <= 1_000_000
}
