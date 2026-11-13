import assert from "node:assert/strict"
import test from "node:test"
import {
  getInspectionFindings,
  validateInspectionEntries,
  validateRoomItem,
} from "../lib/room-inspection-domain.mjs"

test("room item definitions require bounded names, categories, types, and quantities", () => {
  assert.equal(validateRoomItem({
    name: "Bath towel",
    category: "Bathroom",
    itemType: "supply",
    expectedQuantity: 4,
  }), true)
  assert.equal(validateRoomItem({
    name: "Kettle",
    category: "Appliances",
    itemType: "other",
    expectedQuantity: 1,
  }), false)
  assert.equal(validateRoomItem({
    name: " ",
    category: "Bathroom",
    itemType: "supply",
    expectedQuantity: 4,
  }), false)
})

test("inspection entries must account for each expected item exactly once", () => {
  const roomItems = [
    { id: "towels", expectedQuantity: 4 },
    { id: "kettle", expectedQuantity: 1 },
  ]
  const entries = [
    { itemId: "towels", quantity: 2, condition: "good", note: "" },
    { itemId: "kettle", quantity: 1, condition: "damaged", note: "" },
  ]

  assert.equal(validateInspectionEntries(entries, roomItems), true)
  assert.equal(validateInspectionEntries(entries.slice(1), roomItems), false)
  assert.equal(validateInspectionEntries([entries[0], entries[0]], roomItems), false)
  assert.equal(validateInspectionEntries([
    ...entries.slice(0, 1),
    { ...entries[1], quantity: 2 },
  ], roomItems), false)
})

test("checkout findings report quantities to restock and missing or damaged items", () => {
  assert.deepEqual(getInspectionFindings([
    { itemId: "towels", name: "Bath towel", quantity: 2, expectedQuantity: 4, condition: "good" },
    { itemId: "kettle", name: "Kettle", quantity: 1, expectedQuantity: 1, condition: "damaged" },
    { itemId: "cup", name: "Cup", quantity: 0, expectedQuantity: 1, condition: "missing" },
    { itemId: "soap", name: "Soap", quantity: 2, expectedQuantity: 2, condition: "good" },
  ]), [
    {
      itemId: "towels",
      name: "Bath towel",
      category: undefined,
      restockQuantity: 2,
      needsReplacement: false,
      condition: "good",
    },
    {
      itemId: "kettle",
      name: "Kettle",
      category: undefined,
      restockQuantity: 0,
      needsReplacement: true,
      condition: "damaged",
    },
    {
      itemId: "cup",
      name: "Cup",
      category: undefined,
      restockQuantity: 1,
      needsReplacement: true,
      condition: "missing",
    },
  ])
})
