import { CheckCircle2 } from "lucide-react"

export default function FeedbackSubmittedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-4 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-xl">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-emerald-950">Thank you for your feedback!</h1>
        <p className="mt-2 text-sm text-slate-600">Your one-time response has been sent to the resort.</p>
      </section>
    </main>
  )
}
