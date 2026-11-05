/**
 * Gmail app passwords: strip spaces and invisible characters often copied from Google UI.
 */
export function normalizeSmtpPassword(raw) {
  return String(raw || "")
    .replace(/[\s\u200B-\u200D\uFEFF\u00AD\u202F]+/g, "")
    .trim()
}
