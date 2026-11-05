"use client"

import { Button } from "@/components/ui/button"

export default function HeroSection() {
  const scrollToBooking = () => {
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <section id="home" className="pt-20 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage: "url(/placeholder.svg?height=800&width=1200&query=luxury-hotel-room)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 -z-10 bg-black/40" />

      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[500px]">
        <div className="text-center text-white">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 leading-tight text-balance">
            Book Your Stay Easily
          </h1>
          <p className="text-xl sm:text-2xl mb-8 text-gray-100 max-w-2xl mx-auto text-balance">
            Experience luxury accommodations with world-class service and unbeatable comfort
          </p>
          <Button
            onClick={scrollToBooking}
            className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-3 text-lg rounded-full"
          >
            Book Now
          </Button>
        </div>
      </div>
    </section>
  )
}
