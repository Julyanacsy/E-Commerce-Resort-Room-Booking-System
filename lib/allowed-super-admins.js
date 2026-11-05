/** Emails allowed to use the Super Admin console (Google sign-in). */
export const ALLOWED_SUPER_ADMIN_EMAILS = [
  "ecommerceresortadmin@gmail.com",
  "commerceresortadmin@gmail.com",
]

export function isAllowedSuperAdminEmail(email) {
  const e = String(email || "").trim().toLowerCase()
  return ALLOWED_SUPER_ADMIN_EMAILS.includes(e)
}
