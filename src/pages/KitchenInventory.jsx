import { toUserMessage } from "../services/userMessages"
import { useConfirm } from "../hooks/useConfirm"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Minus, Package, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { observeCollection, saveInventory, deleteInventory } from "../services/dataService"
import { useRBAC } from "../context/rbacContextValue"
import { currentRegion } from "../services/regionalSettings"
import { PERMISSIONS } from "../services/roleService"
import { Modal } from "../components/Modal"
import "./kitchen.css"
import "./staff.css"

const STATUS = {
  out: { label: "Out" },
  low: { label: "Low" },
  ok: { label: "OK" },
}
const FILTERS = [
  { key: "all", label: "All" },
  { key: "low", label: "Low" },
  { key: "out", label: "Out" },
]

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
  const [filter, setFilter] = useState("all")
  const [formError, setFormError] = useState("")
  // Errors from quick actions show above the list instead of replacing it.
  const [actionError, setActionError] = useState("")

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

  const shown = filter === "all" ? filtered : filtered.filter((item) => statusOf(item) === filter)

  // Quick count change without opening the form (managers and admins only; they also see the cost, so nothing is lost).
  const adjust = async (item, delta) => {
    const quantity = Math.max(0, Math.round((qtyOf(item) + delta) * 100) / 100)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity } : i)))
    try { await saveInventory({ ...item, quantity }) }
    catch (error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
      setActionError(toUserMessage(error, "Could not update the count. Please retry."))
    }
  }

  const blank = { name: "", category: "", unit: "units", quantity: 0, lowStockThreshold: 5, supplierCost: 0 }

  return (
    <div className="oc-page">
      {confirmDialog}
      <header className="oc-head">
        <div>
          <h1>Inventory</h1>
          <p>{items.length} items · {summary.low} low · {summary.out} out</p>
        </div>
        {canManage ? (
          <button className="oc-head-action" type="button" onClick={() => { setFormError(""); setForm(blank) }}>
            <Plus size={18} /> Add item
          </button>
        ) : null}
      </header>
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}

      <section className="oc-toolbar">
        <label className="oc-search">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients" aria-label="Search inventory" />
        </label>
        <div className="oc-chips" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="oc-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}{f.key !== "all" ? <span className="oc-chip-count">{summary[f.key]}</span> : null}
            </button>
          ))}
        </div>
      </section>

      {loadError ? (
        <div className="oc-empty">
          <AlertTriangle size={28} />
          <strong role="alert">{loadError}</strong>
          <button className="oc-quiet" type="button" onClick={() => setVersion((v) => v + 1)}>Try again</button>
        </div>
      ) : loading ? (
        <div className="kq-ticket kq-skeleton" aria-hidden="true" />
      ) : shown.length === 0 ? (
        <div className="oc-empty">
          <Package size={28} strokeWidth={1.5} />
          <strong>{items.length === 0 ? "Nothing tracked yet" : "Nothing matches"}</strong>
          <p>{items.length === 0 ? "Add the ingredients you want to keep an eye on." : "Try another search or filter."}</p>
        </div>
      ) : (
        <div className="ad-list">
          {shown.map((item) => {
            const key = statusOf(item)
            return (
              <article className="ad-row" key={item.id}>
                <div className="ad-row-main">
                  <h3 className="ad-row-title">
                    {item.name || item.ingredient || "Unknown"}
                    {key !== "ok" ? <span className={`badge ${key === "out" ? "rejected" : "pending"}`} style={{ marginLeft: 8 }}>{STATUS[key].label}</span> : null}
                  </h3>
                  <p className="ad-row-sub">{item.category || "No category"} · alert at {item.lowStockThreshold ?? 5} {item.unit || ""}</p>
                </div>
                <div className="ad-row-actions">
                  {canManage ? (
                    <div className="ad-stepper" role="group" aria-label={`Count for ${item.name}`}>
                      <button type="button" className="ad-icon" onClick={() => adjust(item, -1)} disabled={qtyOf(item) <= 0} aria-label="One less"><Minus size={16} /></button>
                      <span className="ad-qty"><strong>{qtyOf(item)}</strong> {item.unit}</span>
                      <button type="button" className="ad-icon" onClick={() => adjust(item, 1)} aria-label="One more"><Plus size={16} /></button>
                    </div>
                  ) : (
                    <span className="ad-qty"><strong>{qtyOf(item)}</strong> {item.unit}</span>
                  )}
                  {canManage ? (
                    <>
                      <button className="ad-icon" type="button" onClick={() => { setFormError(""); setForm(item) }} aria-label={`Edit ${item.name}`} title="Edit"><Pencil size={18} /></button>
                      <button className="ad-icon oc-danger" type="button" aria-label={`Remove ${item.name}`} title="Remove" onClick={async () => {
                        if (!(await confirm(`Remove ${item.name} from inventory?`, { title: "Remove item?", confirmLabel: "Remove" }))) return
                        try { await deleteInventory(item.id); setVersion((v) => v + 1) }
                        catch (error) { setActionError(toUserMessage(error)) }
                      }}><Trash2 size={18} /></button>
                    </>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {form && canManage ? (
        <Modal title={form.id ? `Edit ${form.name}` : "Add an inventory item"} busy={saving} onClose={() => setForm(null)}>
          <form className="ad-form" onSubmit={async (event) => {
            event.preventDefault(); if (saving) return; setSaving(true); setFormError("")
            try { await saveInventory(form); setForm(null); setVersion((v) => v + 1) }
            catch (error) { setFormError(toUserMessage(error)) } finally { setSaving(false) }
          }}>
            <div className="ad-fields">
              <label className="ad-field">Name<input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Coffee beans" /></label>
              <label className="ad-field">Category <small>(optional)</small><input maxLength={80} value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Ingredients" /></label>
            </div>
            <div className="ad-fields">
              <label className="ad-field">Unit<input required maxLength={40} list="inventory-units" value={form.unit || ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, litres, units" /><datalist id="inventory-units"><option value="kg" /><option value="g" /><option value="litres" /><option value="ml" /><option value="units" /></datalist></label>
              <label className="ad-field">On hand<input required type="number" min="0" step="any" inputMode="decimal" value={form.quantity ?? ""} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
            </div>
            <div className="ad-fields">
              <label className="ad-field">Warn me at<input required type="number" min="0" step="any" inputMode="decimal" value={form.lowStockThreshold ?? ""} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} /><small>Shows as Low at or below this amount.</small></label>
              <label className="ad-field">Cost per unit ({currentRegion().currency}) <small>(optional)</small><input type="number" min="0" step="0.01" inputMode="decimal" value={form.supplierCost ?? ""} onChange={(e) => setForm({ ...form, supplierCost: e.target.value })} /></label>
            </div>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="row-actions">
              <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Add item"}</button>
              <button className="ghost-button" type="button" disabled={saving} onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
