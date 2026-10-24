import { toUserMessage } from "../services/userMessages"
import { useConfirm } from "../hooks/useConfirm"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Package, Search } from "lucide-react"
import { observeCollection, saveInventory, deleteInventory } from "../services/dataService"
import { useRBAC } from "../context/rbacContextValue"
import { currentRegion } from "../services/regionalSettings"
import { PERMISSIONS } from "../services/roleService"

const STATUS = {
  out: { label: "Out of Stock" },
  low: { label: "Low Stock" },
  ok: { label: "Available" },
}

export function KitchenInventory() {
  const [confirm, confirmDialog] = useConfirm()
  const { can } = useRBAC()
  const canManage = can(PERMISSIONS.INVENTORY_MANAGE)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(0)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState("")
  const [loadError, setLoadError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setLoadError("")
    const unsubscribe = observeCollection(
      "inventory",
      (data) => {
        setItems(data)
        setLoadError("")
        setLoading(false)
      },
      (msg) => {
        setLoadError(msg)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [version])

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase().trim()
    return items.filter((i) =>
      (i.name || i.ingredient || "").toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q),
    )
  }, [items, search])

  const qtyOf = (item) => Number(item.quantity || item.stock || 0)

  const statusOf = (item) => {
    const qty = qtyOf(item)
    if (qty <= 0) return "out"
    if (qty <= (item.lowStockThreshold ?? 5)) return "low"
    return "ok"
  }

  const summary = useMemo(() => {
    const counts = { out: 0, low: 0, ok: 0 }
    items.forEach((item) => {
      counts[statusOf(item)] += 1
    })
    return counts
  }, [items])

  return (
    <div className="kds-root">
      {confirmDialog}
      <header className="kds-header kds-stock-header">
        <div className="kds-header-left">
          <h1 className="kds-title">Inventory</h1>
          <span className="kds-count-badge">{items.length} tracked</span>
        </div>
        <label className="kds-stock-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredients..."
          />
        </label>
      </header>
      {canManage ? <button className="primary-button" onClick={() => setForm({ name: "", category: "", unit: "units", quantity: 0, lowStockThreshold: 5, supplierCost: 0 })}>Add inventory item</button> : null}
      {form && canManage ? <form className="summary-panel inventory-form" onSubmit={async (event) => {
        event.preventDefault(); if (saving) return; setSaving(true); setLoadError("")
        try { await saveInventory(form); setForm(null); setVersion((v) => v + 1) }
        catch (error) { setLoadError(toUserMessage(error)) } finally { setSaving(false) }
      }}>
        <h2>{form.id ? "Edit inventory" : "Add inventory"}</h2>
        <p className="form-help">Choose a consistent unit for stock counts, low-stock alerts and cost per unit. Required fields are marked *.</p>
        <div className="form-grid">
          <label className="field"><span>Item name *</span><input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Coffee beans" /></label>
          <label className="field"><span>Category (optional)</span><input maxLength={80} value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Ingredients" /></label>
          <label className="field"><span>Stock unit *</span><input required maxLength={40} list="inventory-units" value={form.unit || ""} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="e.g. kg, litres, units" /><datalist id="inventory-units"><option value="kg" /><option value="g" /><option value="litres" /><option value="ml" /><option value="units" /></datalist></label>
          <label className="field"><span>Quantity on hand *</span><input required type="number" min="0" step="any" inputMode="decimal" value={form.quantity ?? ""} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
          <label className="field"><span>Low-stock threshold *</span><input required type="number" min="0" step="any" inputMode="decimal" value={form.lowStockThreshold ?? ""} onChange={e => setForm({ ...form, lowStockThreshold: e.target.value })} /><small className="form-help">An alert appears when stock reaches this quantity.</small></label>
          <label className="field"><span>Cost per unit ({currentRegion().currency})</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.supplierCost ?? ""} onChange={e => setForm({ ...form, supplierCost: e.target.value })} /><small className="form-help">Optional; leave at 0 when the cost is not tracked.</small></label>
        </div>
        {loadError && <p className="form-error" role="alert">{loadError}</p>}
        <div className="form-actions"><button className="ghost-button" type="button" disabled={saving} onClick={() => setForm(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save inventory item"}</button></div>
      </form> : null}

      {loadError ? (
        <div className="kds-empty">
          <AlertTriangle size={28} />
          <p role="alert">{loadError}</p>
          <button className="ghost-button" onClick={() => setVersion((v) => v + 1)}>Try again</button>
        </div>
      ) : (
        <>
          <div className="kds-stock-summary">
            {Object.entries(STATUS).map(([key, s]) => (
              <div key={key} className={`kds-stock-chip kds-stock-chip-${key}`}>
                <span className="kds-stock-chip-count">{summary[key]}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="kds-stock-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="kds-ticket kds-ticket-skeleton" key={i}>
                  <div className="kds-skel-line" style={{ height: 30, width: 72 }} />
                  <div className="kds-skel-line" style={{ height: 18, width: "70%" }} />
                  <div className="kds-skel-line" style={{ height: 14, width: "45%" }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="kds-empty">
              <Package size={28} />
              <p>
                {items.length === 0
                  ? "No inventory data available yet."
                  : "No ingredients match your search."}
              </p>
            </div>
          ) : (
            <div className="kds-stock-grid">
              {filtered.map((item) => {
                const key = statusOf(item)
                const qty = qtyOf(item)
                return (
                  <article className={`kds-ticket kds-stock-card kds-stock-${key}`} key={item.id}>
                    <div className="kds-stock-top">
                      <div className="kds-stock-qty-group">
                        <span className="kds-stock-qty">{qty}</span>
                        {item.unit ? <span className="kds-stock-unit">{item.unit}</span> : null}
                      </div>
                      <span className={`kds-stock-status kds-stock-status-${key}`}>
                        {key === "out" ? <AlertTriangle size={15} /> : <Package size={15} />}
                        {STATUS[key].label}
                      </span>
                    </div>
                    <h3 className="kds-stock-name">{item.name || item.ingredient || "Unknown"}</h3>
                    {item.category ? <span className="kds-stock-sub">{item.category}</span> : null}
                    {canManage ? <div className="inventory-actions">
                      <button className="ghost-button" onClick={() => setForm(item)}>Edit</button>
                      <button className="ghost-button danger" onClick={async () => {
                        if (!(await confirm(`Remove ${item.name} from inventory?`, { title: "Remove item?", confirmLabel: "Remove" }))) return
                        try { await deleteInventory(item.id); setVersion((v) => v + 1) }
                        catch (error) { setLoadError(toUserMessage(error)) }
                      }}>Remove</button>
                    </div> : null}
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
