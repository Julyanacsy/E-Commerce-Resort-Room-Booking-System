"use client"

import { useEffect, useState } from "react"
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore"
import { toast } from "sonner"
import { db } from "@/lib/firebase"

function formatCreatedAt(timestamp) {
  const date = timestamp?.toDate?.()
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : "Date unavailable"
}

export default function ManageFeedback({ isLegacyHelpdesk, ownerUid }) {
  const [feedbackItems, setFeedbackItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [updatingId, setUpdatingId] = useState("")

  useEffect(() => {
    if (!db || (!isLegacyHelpdesk && !ownerUid)) {
      setFeedbackItems([])
      setError(!db ? "Firebase is not configured." : "No resort owner is selected.")
      setLoading(false)
      return undefined
    }

    setLoading(true)
    setError("")
    const feedbackRef = collection(db, "feedbacks")
    const feedbackQuery =
      ownerUid && !isLegacyHelpdesk
        ? query(feedbackRef, where("ownerUid", "==", ownerUid))
        : query(feedbackRef)

    return onSnapshot(
      feedbackQuery,
      (snapshot) => {
        const scopedFeedback = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((feedback) =>
            isLegacyHelpdesk ? !feedback.ownerUid : feedback.ownerUid === ownerUid,
          )
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        setFeedbackItems(scopedFeedback)
        setLoading(false)
      },
      (snapshotError) => {
        console.error("Failed to load guest feedback:", snapshotError)
        setError("Guest feedback could not be loaded.")
        setLoading(false)
      },
    )
  }, [isLegacyHelpdesk, ownerUid])

  const handleVisibilityChange = async (feedbackId, status) => {
    setUpdatingId(feedbackId)
    try {
      await updateDoc(doc(db, "feedbacks", feedbackId), {
        status,
        updatedAt: serverTimestamp(),
      })
      toast.success(status === "Published" ? "Feedback published." : "Feedback hidden.")
    } catch (updateError) {
      console.error("Failed to update guest feedback:", updateError)
      toast.error(updateError?.message || "Failed to update feedback.")
    } finally {
      setUpdatingId("")
    }
  }

  return (
    <section className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Manage Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose which guest reviews appear on your resort site.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">Loading feedback…</p>
      ) : error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>
      ) : feedbackItems.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No feedback yet.</p>
      ) : (
        <div className="space-y-4">
          {feedbackItems.map((feedback) => {
            const published = String(feedback.status || "").toLowerCase() === "published"
            return (
              <article key={feedback.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">{feedback.name || "Guest"}</h2>
                    <p className="text-sm text-muted-foreground">{feedback.email || "No email provided"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatCreatedAt(feedback.createdAt)}</p>
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${published ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                    {published ? "Published" : "Hidden"}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-amber-600" aria-label={`${feedback.rating || 0} out of 5 stars`}>
                  {"★".repeat(Math.max(0, Math.min(5, Number(feedback.rating) || 0)))}
                  {"☆".repeat(5 - Math.max(0, Math.min(5, Number(feedback.rating) || 0)))}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{feedback.message || ""}</p>
                <button
                  type="button"
                  disabled={updatingId === feedback.id}
                  onClick={() => handleVisibilityChange(feedback.id, published ? "Hidden" : "Published")}
                  className="mt-4 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {updatingId === feedback.id ? "Saving…" : published ? "Hide feedback" : "Publish feedback"}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
