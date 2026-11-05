import { redirect } from "next/navigation"
import { normalizeOwnerUidFromSearchParam } from "@/lib/booking-tenant"

export default function StayRedirectPage({ params }) {
  const raw = normalizeOwnerUidFromSearchParam(params?.ownerUid) || ""
  if (!raw) {
    redirect("/")
  }
  redirect(`/?o=${encodeURIComponent(raw)}`)
}
