"use client"

export default function BrandSettings({ form, saving, saved, defaults, onFieldChange, onSubmit, onReset }) {
  const previewName = form.name || defaults.name
  const previewTagline = form.tagline || defaults.tagline
  const getInitials = (raw) => {
    const name = String(raw || "").trim()
    if (!name) return "R"
    const parts = name.split(/\s+/).filter(Boolean)
    const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).filter(Boolean)
    return (letters.join("") || name[0]?.toUpperCase() || "R").slice(0, 2)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Brand Settings</h1>
      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="space-y-6 rounded-xl bg-white p-6 shadow-lg">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Brand Name</label>
            <input
              type="text"
              value={form.name}
              onChange={onFieldChange("name")}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder="Hotel name"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Tagline</label>
            <input
              type="text"
              value={form.tagline}
              onChange={onFieldChange("tagline")}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder="Luxury reimagined"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Logo URL <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <input
              type="url"
              value={form.logo}
              onChange={onFieldChange("logo")}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder="https://your-domain.com/logo.png"
            />
            <p className="mt-2 text-xs text-gray-500">
              Optional. Leave blank to use the text/placeholder mark in the nav. Transparent PNG or SVG works best.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-emerald-700 py-2 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                  Saving…
                </span>
              ) : (
                "Save Changes"
              )}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="flex-1 rounded-lg border border-emerald-200 py-2 font-semibold text-emerald-800 transition hover:border-emerald-400 hover:text-emerald-900"
            >
              Reset to Default
            </button>
          </div>
          {saved && <p className="text-sm font-semibold text-emerald-600">Branding saved! Refresh the public site to verify.</p>}
        </form>
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-700 to-emerald-600 p-6 text-white shadow-lg">
          <p className="text-xs uppercase tracking-[0.35em] text-white/80">Live Preview</p>
          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-white/10">
              {form.logo ? (
                <img src={form.logo} alt="Brand preview" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div
                  aria-label="Brand preview"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="4" y="4" width="7" height="7" rx="2" fill="currentColor" />
                    <rect x="13" y="4" width="7" height="7" rx="2" fill="currentColor" />
                    <rect x="4" y="13" width="7" height="7" rx="2" fill="currentColor" />
                    <rect x="13" y="13" width="7" height="7" rx="2" fill="currentColor" />
                  </svg>
                </div>
              )}
            </div>
            <div>
              <p className="text-3xl font-light tracking-[0.3em] uppercase">{previewName}</p>
              <p className="text-sm text-white/80">{previewTagline}</p>
            </div>
          </div>
          <div className="mt-8 rounded-lg bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.35em] text-white/70">Landing Page</p>
            <p className="text-lg font-semibold">{previewName}</p>
            <p className="text-sm text-white/70">
              Updates instantly sync with the hero section, navigation logo, and admin login screen.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

