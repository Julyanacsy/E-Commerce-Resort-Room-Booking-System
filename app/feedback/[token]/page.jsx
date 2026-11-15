import GuestFeedbackForm from "@/components/guest-feedback-form"

export default async function FeedbackPage({ params }) {
  const { token } = await params
  return <GuestFeedbackForm token={token} />
}
