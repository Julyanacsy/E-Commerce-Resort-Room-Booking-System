import assert from "node:assert/strict"
import test from "node:test"
import {
  KAMAYAN_GUEST_INFO_DEFAULTS,
  isKamayanResort,
  resolveResortGuestInfo,
} from "../lib/kamayan-guest-info.mjs"

test("Kamayan branding receives the supplied editable rates and guest information defaults", () => {
  const info = resolveResortGuestInfo({ name: "Kamayan Penthouse Beach Resort" })

  assert.equal(isKamayanResort("Kamayan Penthouse Beach Resort"), true)
  assert.match(info.guestRatesText, /Day Swimming Rate[\s\S]*Adult: PHP 50[\s\S]*Night Swimming Rate \(6 PM to 10 PM\)/)
  assert.match(info.guestRatesText, /Small \(Terrace\): PHP 300 \/ 10 pax/)
  assert.match(info.guestContactText, /09088124538/)
  assert.match(info.guestContactText, /kamayanpenthousebeachresort@gmail\.com/)
  assert.match(info.resortRulesText, /Children under 14 must be accompanied by an adult/)
})

test("saved guest information overrides defaults and empty strings can hide a section", () => {
  const info = resolveResortGuestInfo({
    name: "Kamayan Penthouse Beach Resort",
    guestAnnouncementText: "Custom announcement",
    guestRatesText: "",
  })

  assert.equal(info.guestAnnouncementText, "Custom announcement")
  assert.equal(info.guestRatesText, "")
  assert.equal(info.guestAmenitiesText, KAMAYAN_GUEST_INFO_DEFAULTS.guestAmenitiesText)
})

test("non-Kamayan resorts never inherit Kamayan rates, contact details, or rules", () => {
  const info = resolveResortGuestInfo({ name: "Azure Cove Resort" })

  assert.equal(isKamayanResort("Azure Cove Resort"), false)
  assert.equal(info.guestRatesText, "")
  assert.equal(info.guestContactText, "")
  assert.equal(info.resortRulesText, "")
})

test("other resorts can use their own guest information without inheriting Kamayan defaults", () => {
  const info = resolveResortGuestInfo({
    name: "Azure Cove Resort",
    guestAnnouncementTitle: "Visitor Guidelines",
    guestAnnouncementText: "Please follow our resort's visitor policy.",
    guestRatesText: "Pool access: PHP 80 per guest",
    guestContactText: "Call the front desk at 09123456789",
    guestAmenitiesText: "Infinity pool and beachfront dining",
    resortRulesText: "Guests must follow posted pool hours.",
  })

  assert.equal(info.guestAnnouncementTitle, "Visitor Guidelines")
  assert.equal(info.guestAnnouncementText, "Please follow our resort's visitor policy.")
  assert.equal(info.guestRatesText, "Pool access: PHP 80 per guest")
  assert.equal(info.guestContactText, "Call the front desk at 09123456789")
  assert.equal(info.guestAmenitiesText, "Infinity pool and beachfront dining")
  assert.equal(info.resortRulesText, "Guests must follow posted pool hours.")
})
