"use client"

import type React from "react"

import { useState } from "react"
import { Star, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FeedbackFormData {
  name: string
  email: string
  message: string
  rating: number
}

export default function FeedbackSection() {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [formData, setFormData] = useState<FeedbackFormData>({
    name: "",
    email: "",
    message: "",
    rating: 5,
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleRating = (rating: number) => {
    setFormData((prev) => ({
      ...prev,
      rating,
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitted(true)
    setTimeout(() => {
      setIsSubmitted(false)
      setFormData({
        name: "",
        email: "",
        message: "",
        rating: 5,
      })
    }, 3000)
  }

  return (
    <section id="feedback" className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/50">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Share Your Feedback</h2>
          <p className="text-muted-foreground text-lg">Help us improve your experience</p>
        </div>

        {isSubmitted ? (
          <div className="bg-card rounded-xl p-12 text-center">
            <CheckCircle size={64} className="mx-auto text-primary mb-4" />
            <h3 className="text-2xl font-bold text-foreground mb-2">Thank You!</h3>
            <p className="text-muted-foreground">Your feedback has been received. Our team will review it shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card rounded-xl p-8 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Name (Optional)</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email*</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-3">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRating(star)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      size={32}
                      className={star <= formData.rating ? "fill-accent text-accent" : "text-muted-foreground"}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">Message*</label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={5}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder="Share your thoughts and experience with us..."
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 text-lg font-semibold"
            >
              Submit Feedback
            </Button>
          </form>
        )}
      </div>
    </section>
  )
}
