"use client"

import { Search } from "lucide-react"

export default function SearchField({ value, onChange, placeholder, className = "" }) {
  const label = placeholder || "Search"
  return (
    <label className={`relative block w-full max-w-sm ${className}`}>
      <span className="sr-only">{label}</span>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="h-10 w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}
