"use client"

import { useState } from "react"
import AdminSidebar from "@/components/admin/admin-sidebar"
import AdminOverview from "@/components/admin/pages/admin-overview"
import ManageRooms from "@/components/admin/pages/manage-rooms"
import ManageBookings from "@/components/admin/pages/manage-bookings"
import BookingHistory from "@/components/admin/pages/booking-history"
import ManageFeedback from "@/components/admin/pages/manage-feedback"

interface AdminDashboardProps {
  onLogout: () => void
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [currentPage, setCurrentPage] = useState("dashboard")

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar currentPage={currentPage} setCurrentPage={setCurrentPage} onLogout={onLogout} />

      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {currentPage === "dashboard" && <AdminOverview />}
          {currentPage === "rooms" && <ManageRooms />}
          {currentPage === "bookings" && <ManageBookings />}
          {currentPage === "history" && <BookingHistory />}
          {currentPage === "feedback" && <ManageFeedback />}
        </div>
      </div>
    </div>
  )
}
