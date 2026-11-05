"use client"

import { useState } from "react"
import { Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Room {
  id: number
  name: string
  price: number
  rating: number
  description: string
  image: string
  amenities: string[]
  fullDescription: string
}

const ROOMS_DATA: Room[] = [
  {
    id: 1,
    name: "Deluxe Room",
    price: 199,
    rating: 4.8,
    description: "Spacious room with city view and premium amenities",
    image: "/deluxe-hotel-room.jpg",
    amenities: ["WiFi", "Air Conditioning", "Mini Bar", "Work Desk", "Premium Bedding"],
    fullDescription:
      "Our Deluxe Rooms offer 45 sqm of luxurious space with stunning city views. Each room features premium furnishings, marble bathrooms, and modern technology.",
  },
  {
    id: 2,
    name: "Suite Room",
    price: 349,
    rating: 4.9,
    description: "Elegant suite with separate living area and premium services",
    image: "/luxury-suite-room.jpg",
    amenities: ["WiFi", "Jacuzzi", "Living Area", "Premium Minibar", "Concierge Service"],
    fullDescription:
      "The Suite Room provides 65 sqm of sophisticated elegance with a separate living and sleeping area. Enjoy premium amenities and personalized service.",
  },
  {
    id: 3,
    name: "Presidential Suite",
    price: 599,
    rating: 5.0,
    description: "Ultimate luxury experience with panoramic views and exclusive amenities",
    image: "/presidential-suite-hotel.jpg",
    amenities: ["WiFi", "Private Pool", "Cinema Room", "24/7 Butler Service", "Spa Access"],
    fullDescription:
      "Experience the pinnacle of luxury in our Presidential Suite spanning 120 sqm. Features a private terrace, cinema room, and dedicated butler service.",
  },
  {
    id: 4,
    name: "Standard Room",
    price: 129,
    rating: 4.6,
    description: "Comfortable and affordable room with essential amenities",
    image: "/standard-hotel-room.jpg",
    amenities: ["WiFi", "Air Conditioning", "Flat Screen TV", "Bathroom", "Comfortable Bed"],
    fullDescription:
      "Our Standard Rooms offer excellent value with all essential amenities. Perfect for budget-conscious travelers who don't want to compromise on comfort.",
  },
]

export default function RoomsSection() {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)

  return (
    <section id="rooms" className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Our Rooms</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Choose from our carefully curated selection of luxurious rooms
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {ROOMS_DATA.map((room) => (
            <div
              key={room.id}
              className="bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={room.image || "/placeholder.svg"}
                  alt={room.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform"
                />
              </div>

              <div className="p-6">
                <h3 className="text-xl font-bold text-foreground mb-2">{room.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">{room.description}</p>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1">
                    <Star size={16} className="fill-accent text-accent" />
                    <span className="text-sm font-semibold text-foreground">{room.rating}</span>
                  </div>
                  <span className="text-2xl font-bold text-primary">${room.price}</span>
                </div>

                <Button
                  onClick={() => setSelectedRoom(room)}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  View Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Room Details Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-3xl font-bold text-foreground">{selectedRoom.name}</h2>
                <button onClick={() => setSelectedRoom(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={24} />
                </button>
              </div>

              <img
                src={selectedRoom.image || "/placeholder.svg"}
                alt={selectedRoom.name}
                className="w-full h-80 object-cover rounded-lg mb-6"
              />

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <span className="text-muted-foreground">Price per Night</span>
                  <p className="text-3xl font-bold text-primary">${selectedRoom.price}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Rating</span>
                  <div className="flex items-center gap-2">
                    <Star size={20} className="fill-accent text-accent" />
                    <span className="text-2xl font-bold text-foreground">{selectedRoom.rating}</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-2">Description</h3>
                <p className="text-muted-foreground leading-relaxed">{selectedRoom.fullDescription}</p>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Amenities</h3>
                <div className="grid grid-cols-2 gap-3">
                  {selectedRoom.amenities.map((amenity, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-accent rounded-full" />
                      <span className="text-foreground">{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 text-lg">
                Book This Room
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
