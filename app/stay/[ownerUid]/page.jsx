import { redirect } from "next/navigation"
import { normalizeOwnerUidFromSearchParam } from "@/lib/booking-tenant"

export default async function StayPage({ params }) {
  const { ownerUid: rawOwnerUid } = await params
  const ownerUid = normalizeOwnerUidFromSearchParam(rawOwnerUid)
  if (!ownerUid) redirect("/")

  redirect(`/?o=${encodeURIComponent(ownerUid)}`)
}
