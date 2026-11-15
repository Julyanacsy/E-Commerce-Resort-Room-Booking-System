"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Archive, ArchiveRestore, ArrowLeft, Package, Pencil, Plus, Save, X } from "lucide-react"
import { toast } from "sonner"
import { resortAdminRequest } from "@/lib/admin-api-client"
import { isLowStock } from "@/lib/inventory-domain.mjs"
import SearchField from "@/components/admin/search-field"

const EMPTY_FORM = { name: "", category: "", quantity: "", lowStockThreshold: "" }

export default function ManageInventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState("")

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await resortAdminRequest("/api/resort/inventory", undefined, "GET")
      if (!Array.isArray(result.items)) throw new Error("The inventory service returned invalid data.")
      setItems(result.items)
    } catch (loadError) {
      console.error("Failed to load inventory:", loadError)
      setError(loadError.message || "Inventory could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const activeItems = useMemo(() => items.filter((item) => item.isArchived !== true), [items])
  const lowStockItems = activeItems.filter(isLowStock)
  const visibleItems = (showArchived ? items.filter((item) => item.isArchived === true) : activeItems)
    .filter((item) =>
      [item.name, item.category, item.quantity, item.lowStockThreshold]
        .some((value) => String(value ?? "").toLowerCase().includes(search.trim().toLowerCase())),
    )

  const startEdit = (item) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      lowStockThreshold: String(item.lowStockThreshold),
    })
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const saveItem = async (event) => {
    event.preventDefault()
    const quantity = Number(form.quantity)
    const lowStockThreshold = Number(form.lowStockThreshold)
    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
      toast.error("Quantity and low-stock threshold must be whole numbers of zero or more.")
      return
    }
    setSaving(true)
    try {
      await resortAdminRequest("/api/resort/inventory", {
        action: editingId ? "update" : "create",
        ...(editingId ? { itemId: editingId } : {}),
        item: { name: form.name, category: form.category, quantity, lowStockThreshold },
      })
      toast.success(editingId ? "Inventory item updated." : "Inventory item added.")
      resetForm()
      await loadItems()
    } catch (saveError) {
      console.error("Failed to save inventory item:", saveError)
      toast.error(saveError.message || "Inventory item could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const updateArchiveStatus = async (item, action) => {
    try {
      await resortAdminRequest("/api/resort/inventory", { action, itemId: item.id })
      toast.success(action === "archive" ? "Inventory item archived." : "Inventory item restored.")
      if (editingId === item.id) resetForm()
      await loadItems()
    } catch (archiveError) {
      console.error("Failed to update inventory archive status:", archiveError)
      toast.error(archiveError.message || "Inventory item could not be updated.")
    }
  }

  return (
    <section className="space-y-6 p-2 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Inventory Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track supplies and get alerts when stock is low.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowArchived(false)
            resetForm()
            document.getElementById("inventory-item-name")?.focus()
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add item
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active inventory items</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{loading ? "…" : activeItems.length}</p>
            </div>
            <Package className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
        </article>
        <article className={`rounded-xl border p-5 shadow-sm ${lowStockItems.length ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-border bg-card"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Low-stock alerts</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{loading ? "…" : lowStockItems.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Items at or below their threshold</p>
            </div>
            <AlertTriangle className={`h-6 w-6 ${lowStockItems.length ? "text-amber-600" : "text-muted-foreground"}`} aria-hidden="true" />
          </div>
        </article>
      </div>

      {lowStockItems.length > 0 && !showArchived && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" role="status">
          <p className="font-semibold">Low stock: {lowStockItems.map((item) => `${item.name} (${item.quantity})`).join(", ")}</p>
        </div>
      )}

      {!showArchived && (
        <form onSubmit={saveItem} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{editingId ? "Edit inventory item" : "Add inventory item"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-sm font-medium text-foreground">
              Item name
              <input id="inventory-item-name" required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" />
            </label>
            <label className="space-y-1 text-sm font-medium text-foreground">
              Category
              <input required maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Housekeeping" className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" />
            </label>
            <label className="space-y-1 text-sm font-medium text-foreground">
              Quantity
              <input required type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" />
            </label>
            <label className="space-y-1 text-sm font-medium text-foreground">
              Low-stock threshold
              <input required type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(event) => setForm({ ...form, lowStockThreshold: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              <Save className="h-4 w-4" aria-hidden="true" /> {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
            </button>
            {editingId && <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground"><X className="h-4 w-4" aria-hidden="true" /> Cancel</button>}
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{showArchived ? "Archived items" : "Inventory items"}</h2>
            <p className="text-sm text-muted-foreground">{showArchived ? "Archived items are excluded from stock alerts." : "Quantity at or below threshold is flagged as low stock."}</p>
          </div>
          <button type="button" onClick={() => { setShowArchived((value) => !value); resetForm() }} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
            {showArchived ? (
              <span className="inline-flex items-center gap-1.5"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</span>
            ) : (
              <span className="inline-flex items-center gap-1.5"><Archive className="h-4 w-4" aria-hidden="true" /> Archived</span>
            )}
          </button>
        </div>
        <div className="border-b border-border px-5 py-3">
          <SearchField value={search} onChange={setSearch} placeholder="Search inventory name or category" />
        </div>
        {error ? (
          <div role="alert" className="p-5 text-sm text-red-700 dark:text-red-300">
            {error} <button type="button" onClick={loadItems} className="font-semibold underline">Try again</button>
          </div>
        ) : loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground" role="status">Loading inventory…</p>
        ) : visibleItems.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {search
              ? `No inventory items match “${search}”.`
              : showArchived
                ? "No archived inventory items."
                : "No inventory items yet. Add one above to get started."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Item</th>
                  <th scope="col" className="px-5 py-3 font-medium">Category</th>
                  <th scope="col" className="px-5 py-3 font-medium">Quantity</th>
                  <th scope="col" className="px-5 py-3 font-medium">Low-stock threshold</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 font-medium text-foreground">{item.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{item.category}</td>
                    <td className="px-5 py-4 text-foreground">{item.quantity}</td>
                    <td className="px-5 py-4 text-muted-foreground">{item.lowStockThreshold}</td>
                    <td className="px-5 py-4">
                      {showArchived ? <span className="text-muted-foreground">Archived</span> : isLowStock(item) ? <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Low stock</span> : <span className="text-emerald-700 dark:text-emerald-300">In stock</span>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {showArchived ? (
                          <button type="button" onClick={() => updateArchiveStatus(item, "restore")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"><ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> Restore</button>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEdit(item)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</button>
                            <button type="button" onClick={() => updateArchiveStatus(item, "archive")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"><Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
