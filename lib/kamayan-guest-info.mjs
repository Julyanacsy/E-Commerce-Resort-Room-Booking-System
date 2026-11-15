export const KAMAYAN_GUEST_INFO_DEFAULTS = {
  guestAnnouncementTitle: "Entrance Fees & Cottage Rates",
  guestAnnouncementText:
    "To our guests, please be guided by our entrance fees and cottage rates. Enjoy the beach and pools at reasonable prices—perfect for weekends, special occasions, and barkada outings!",
  guestRatesText: [
    "Day Swimming Rate",
    "Adult: PHP 50",
    "Kids: PHP 30",
    "",
    "Night Swimming Rate (6 PM to 10 PM)",
    "Adult: PHP 60",
    "Kids: PHP 40",
    "",
    "Cottage Rental",
    "Small: PHP 250 / 10 pax",
    "Small (Terrace): PHP 300 / 10 pax",
    "Big 1 (Kamayan): PHP 600 / 20 pax",
    "Big 2: PHP 500 / 20 pax",
  ].join("\n"),
  guestContactText: [
    "Room accommodation: Ms. Mean — 09088124538 (Smart)",
    "Function hall, venue, and events: Ms. Princess — 09171692377 (Globe)",
    "Email: kamayanpenthousebeachresort@gmail.com",
    "Location: Dalahican, Barangay San Jose, Roxas, Oriental Mindoro",
  ].join("\n"),
  guestAmenitiesText: [
    "Function halls and event venue",
    "12-hour and 24-hour air-conditioned room accommodation",
    "Catering for weddings, birthdays, seminars, and other events",
    "Videoke area",
    "Two adult pools and two kiddie pools",
  ].join("\n"),
  checkInInstructions:
    "Room accommodations are available for 12 or 24 hours. Cottage day tours are from 6 AM to 10 PM. Please observe the posted pool hours.",
  resortRulesText: [
    "CHECK-IN AND CHECK-OUT: Room accommodations are available for 12 or 24 hours only. Cottage day tours are from 6 AM to 10 PM.",
    "COTTAGES: Use only your assigned cottage and observe its posted capacity.",
    "POOL HOURS: Pools are open from 6 AM to 10 PM and closed from 10 PM to 6 AM for maintenance. Pools may close without prior notice.",
    "SWIMMING ATTIRE: Shower before swimming. Maong/denim and cotton clothing are not allowed in the pool. Wear proper swimwear.",
    "POOL SAFETY: Children under 14 must be accompanied by an adult. No diving or running. Anyone under the influence of alcohol or drugs, or suffering from an illness, may not use the pool. Settle pool-use payments at the resort reception before swimming.",
    "ELECTRICITY AND SOUND: Electric appliances may incur power-consumption charges. Loud sound systems are not allowed.",
    "PETS AND FIREARMS: The resort is pet-friendly; follow the resort's pet policy. Firearms and deadly weapons are not allowed inside. Licensed firearms must be surrendered to security personnel.",
    "SECURITY: Security may inspect persons, bags, parcels, and other items upon admission.",
    "MINORS: Minors must be accompanied by an adult.",
    "CLEANLINESS AND CONSERVATION: Use designated trash bins and turn off water faucets and shower bulbs when not in use.",
    "VALUABLES: Keep personal belongings secure. The resort is not responsible for lost, stolen, or damaged belongings.",
    "RIGHT CONDUCT: The resort may deny admission or remove guests who are disruptive, engage in fights, or are under the influence of drugs.",
    "SMOKING: Smoking is allowed only in designated areas.",
    "These rules may change without prior notice.",
  ].join("\n\n"),
}

const EMPTY_GUEST_INFO = Object.fromEntries(
  Object.keys(KAMAYAN_GUEST_INFO_DEFAULTS).map((field) => [field, ""]),
)

export function isKamayanResort(name) {
  const normalizedName = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  return normalizedName.includes("kamayan") && normalizedName.includes("penthouse")
}

export function resolveKamayanGuestInfo(branding = {}) {
  const defaults = isKamayanResort(branding.name)
    ? KAMAYAN_GUEST_INFO_DEFAULTS
    : EMPTY_GUEST_INFO

  return Object.fromEntries(
    Object.keys(KAMAYAN_GUEST_INFO_DEFAULTS).map((field) => [
      field,
      typeof branding[field] === "string" ? branding[field] : defaults[field],
    ]),
  )
}
