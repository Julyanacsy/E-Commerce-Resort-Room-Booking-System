export const KAMAYAN_HELPDESK_EMAIL = "resort.helpdesk01@gmail.com"

export function isKamayanHelpdeskEmail(value) {
  return String(value || "").trim().toLowerCase() === KAMAYAN_HELPDESK_EMAIL
}
