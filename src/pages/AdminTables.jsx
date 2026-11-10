import { useEffect, useState } from "react"
import { Plus, QrCode } from "lucide-react"
import { useParams } from "react-router-dom"
import { TableQrCard } from "../components/TableQrCard"
import { deleteTable, observeTables, saveTable } from "../services/dataService"
import { useRBAC } from "../context/rbacContextValue"
import { PERMISSIONS } from "../services/roleService"
import "./staff.css"

export function AdminTables() {
  const { cafeSlug } = useParams()
  const { can } = useRBAC()
  const canManage = can(PERMISSIONS.TABLE_MANAGE)
  const [saving, setSaving] = useState(false)
  const [tables, setTables] = useState([])
  const [tableNumber, setTableNumber] = useState("")
  const [printTitle, setPrintTitle] = useState("")
  const [printNote, setPrintNote] = useState("")
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    return observeTables(setTables, setLoadError)
  }, [])

  const addTable = async (event) => {
    event.preventDefault()
    if (saving || !canManage) return
    const number = Number(tableNumber)
    if (!Number.isInteger(number) || number < 1) { setLoadError("Enter a positive whole table number."); return }
    // Tables are keyed "table-<cafeSlug>-<number>" — adding an existing
    // number would silently overwrite the previous table's print copy.
    if (tables.some((t) => Number(t.tableNumber) === number)) {
      setLoadError(`Table ${number} already exists for this cafe.`)
      return
    }
    setLoadError("")
    setSaving(true)
    try { await saveTable({
      tableNumber: number,
      label: `Table ${number}`,
      printTitle: printTitle.trim() || "Scan to Order",
      printNote: printNote.trim() || "Point your phone camera to view the menu and place your order",
    }, cafeSlug)
    setTableNumber("")
    setPrintTitle("")
    setPrintNote("")
    } catch { setLoadError("Could not save this table. Please try again.") }
    finally { setSaving(false) }
  }

  return (
    <div className="oc-page">
      <header className="oc-head">
        <div>
          <h1>Tables</h1>
          <p>Print a QR code for each table. Customers scan it to see the menu and order.</p>
        </div>
      </header>
      {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}

      {canManage ? (
        <form className="ad-section ad-form" onSubmit={addTable}>
          <div className="ad-section-head">
            <div>
              <h2>Add a table</h2>
              <p>The QR code is ready to print as soon as you add it.</p>
            </div>
          </div>
          <div className="ad-fields">
            <label className="ad-field">
              Table number
              <input type="number" min="1" step="1" inputMode="numeric" value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} placeholder="e.g. 5" required />
            </label>
            <label className="ad-field">
              Heading on the card <small>(optional)</small>
              <input maxLength={120} value={printTitle} onChange={(event) => setPrintTitle(event.target.value)} placeholder="Scan to Order" />
            </label>
            <label className="ad-field">
              Instructions on the card <small>(optional)</small>
              <input maxLength={300} value={printNote} onChange={(event) => setPrintNote(event.target.value)} placeholder="Point your phone camera to view the menu" />
            </label>
          </div>
          <div>
            <button className="oc-head-action" type="submit" disabled={saving}>
              <Plus size={18} /> {saving ? "Adding…" : "Add table"}
            </button>
          </div>
        </form>
      ) : null}

      {tables.length === 0 ? (
        <div className="oc-empty">
          <QrCode size={32} strokeWidth={1.5} />
          <strong>No tables yet</strong>
          <p>Add your first table above to get a printable QR code.</p>
        </div>
      ) : (
        <section className="ad-qr-grid">
          {tables.map((table) => (
            <TableQrCard
              key={table.id}
              table={table}
              onDelete={canManage ? async (id) => { try { await deleteTable(id) } catch { setLoadError("Could not remove this table.") } } : undefined}
              onSave={canManage ? (tableData) => saveTable(tableData, cafeSlug) : undefined}
            />
          ))}
        </section>
      )}
    </div>
  )
}
