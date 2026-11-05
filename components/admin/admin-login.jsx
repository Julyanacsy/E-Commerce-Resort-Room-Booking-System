"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Lock, Mail } from "lucide-react"

interface AdminLoginProps {
  onLogin: () => void
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Static demo login
    if (email === "admin@luxestay.com" && password === "admin123") {
      onLogin()
      setError("")
    } else {
      setError("Invalid credentials. Try admin@luxestay.com / admin123")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">LuxeStay</h1>
          <p className="text-muted-foreground">Admin Portal</p>
        </div>

        <div className="bg-card rounded-xl p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-foreground mb-6">Login</h2>

          {error && <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="admin@luxestay.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              Login
            </Button>
          </form>

          <div className="mt-4 p-4 bg-secondary/50 rounded-lg text-xs text-muted-foreground">
            <p className="font-semibold mb-1">Demo Credentials:</p>
            <p>Email: admin@luxestay.com</p>
            <p>Password: admin123</p>
          </div>
        </div>
      </div>
    </div>
  )
}
