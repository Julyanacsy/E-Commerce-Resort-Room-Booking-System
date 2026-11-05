"use client"

import { LogOut, LayoutGrid, DoorOpen, BookOpen, RotateCcw, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AdminSidebarProps {
  currentPage: string
  setCurrentPage: (page: string) => void
  onLogout: () => void
}

export default function AdminSidebar({ currentPage, setCurrentPage, onLogout }: AdminSidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "rooms", label: "Manage Rooms", icon: DoorOpen },
    { id: "bookings", label: "Manage Bookings", icon: BookOpen },
    { id: "history", label: "Booking History", icon: RotateCcw },
    { id: "feedback", label: "Feedback", icon: MessageSquare },
  ]

  return (
    <div className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border min-h-screen flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-2xl font-bold">LuxeStay</h1>
        <p className="text-xs text-sidebar-foreground/60">Admin Portal</p>
      </div>

      <nav className="flex-1 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id

          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar/80"
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <Button
          onClick={onLogout}
          className="w-full flex items-center gap-2 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/90"
        >
          <LogOut size={18} />
          Logout
        </Button>
      </div>
    </div>
  )
}
