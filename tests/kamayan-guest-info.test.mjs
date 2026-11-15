import assert from "node:assert/strict"
import test from "node:test"
import {
  KAMAYAN_GUEST_INFO_DEFAULTS,
  isKamayanResort,
  resolveKamayanGuestInfo,
} from "../lib/kamayan-guest-info.mjs"

test("Kamayan branding receives the supplied editable rates and guest information defaults", () => {
  const info = resolveKamayanGuestInfo({ name: "Kamayan Penthouse Beach Resort" })

  assert.equal(isKamayanResort("Kamayan Penthouse Beach Resort"), true)
  assert.match(info.guestRatesText, /Day Swimming Rate[\s\S]*Adult: PHP 50[\s\S]*Night Swimming Rate \(6 PM to 10 PM\)/)
  assert.match(info.guestRatesText, /Small \(Terrace\): PHP 300 \/ 10 pax/)
  assert.match(info.guestContactText, /09088124538/)
  assert.match(info.guestContactText, /kamayanpenthousebeachresort@gmail\.com/)
  assert.match(info.resortRulesText, /Children under 14 must be accompanied by an adult/)
})

test("saved guest information overrides defaults and empty strings can hide a section", () => {
  const info = resolveKamayanGuestInfo({
    name: "Kamayan Penthouse Beach Resort",
    guestAnnouncementText: "Custom announcement",
    guestRatesText: "",
  })

  assert.equal(info.guestAnnouncementText, "Custom announcement")
  assert.equal(info.guestRatesText, "")
  assert.equal(info.guestAmenitiesText, KAMAYAN_GUEST_INFO_DEFAULTS.guestAmenitiesText)
})

test("non-Kamayan resorts never inherit Kamayan rates, contact details, or rules", () => {
  const info = resolveKamayanGuestInfo({ name: "Azure Cove Resort" })

  assert.equal(isKamayanResort("Azure Cove Resort"), false)
  assert.equal(info.guestRatesText, "")
  assert.equal(info.guestContactText, "")
  assert.equal(info.resortRulesText, "")
})
