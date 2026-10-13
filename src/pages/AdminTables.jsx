import { useEffect, useState } from "react"
import { Plus, QrCode, Sparkles } from "lucide-react"
import { useParams } from "react-router-dom"
import { TableQrCard } from "../components/TableQrCard"
import { deleteTable, observeTables, saveTable } from "../services/dataService"
import { useRBAC } from "../context/rbacContextValue"
import { PERMISSIONS } from "../services/roleService"

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
    <div className="admin-stack">
      <div className="admin-head">
        <div>
          <p className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <QrCode size={14} /> QR Management & Table Routing
          </p>
          <h2>Tables & QR Codes</h2>
          <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: "0.9rem" }}>
            Generate, customize, and print high-resolution A5 QR codes for each table.
          </p>
          {loadError ? <p className="form-error">{loadError}</p> : null}
        </div>

        {canManage ? <form className="admin-add-table-form" onSubmit={addTable}>
          <div className="form-row-inline">
            <label className="field"><span>Table number *</span><input
              type="number"
              min="1" step="1"
              value={tableNumber}
              onChange={(event) => setTableNumber(event.target.value)}
              placeholder="Table #"
              required
              className="table-num-input"
            /></label>
            <label className="field"><span>QR heading (optional)</span><input maxLength={120}
              value={printTitle}
              onChange={(event) => setPrintTitle(event.target.value)}
              placeholder="Custom heading (optional)"
              className="table-title-input"
            /></label>
            <label className="field"><span>QR instructions (optional)</span><input maxLength={300}
              value={printNote}
              onChange={(event) => setPrintNote(event.target.value)}
              placeholder="Instruction note (optional)"
              className="table-note-input"
            /></label>
            <button className="primary-button" type="submit" disabled={saving}>
              <Plus size={18} />
              Add Table
            </button>
          </div>
        </form> : null}
      </div>

      <section className="qr-grid-container">
        {tables.length === 0 ? (
          <div className="empty-state-box" style={{ padding: "48px 24px", textAlign: "center" }}>
            <Sparkles size={36} style={{ color: "var(--brand-ink)", marginBottom: 12 }} />
            <h3>No Tables Added Yet</h3>
            <p style={{ color: "#6b7280", maxWidth: 420, margin: "0 auto 16px" }}>
              Add table numbers above to instantly create print-ready A5 QR codes for your customers.
            </p>
          </div>
        ) : null}

        {tables.map((table) => (
          <TableQrCard
            key={table.id}
            table={table}
            onDelete={canManage ? async (id) => { try { await deleteTable(id) } catch { setLoadError("Could not remove this table.") } } : undefined}
            onSave={canManage ? (tableData) => saveTable(tableData, cafeSlug) : undefined}
          />
        ))}
      </section>
    </div>
  )
}
