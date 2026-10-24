import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChefHat } from "lucide-react"
import { observeOrders } from "../services/dataService"
import { matchesStation } from "../services/kitchenQueue"
import "./kitchen.css"
import "./staff.css"

const STATIONS = [
  { key: "all", label: "All" },
  { key: "food", label: "Food" },
  { key: "drinks", label: "Drinks" },
]

const DONE_STATUSES = ["ready", "paid", "rejected"]
const STATUS_LABEL = { ready: "Done", paid: "Paid", rejected: "Rejected" }

function toMs(value) {
  if (!value) return null
  if (typeof value === "number") return value > 1e9 ? value : null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

const createdMs = (order) => toMs(order.createdAtMs) ?? toMs(order.createdAt) ?? Date.now()
// Kitchen staff only receive ready_at_ms (no payment fields), so check it first.
const doneMs = (order) => toMs(order.readyAtMs) ?? toMs(order.readyAt) ?? toMs(order.paidAt) ?? toMs(order.updatedAt) ?? createdMs(order)

export function KitchenHistory() {
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [station, setStation] = useState("all")

  useEffect(() => {
    // Last 31 days is plenty for the 50 most recent; never load the full history here.
    return observeOrders((nextOrders) => {
      setOrders(nextOrders)
      setLoaded(true)
    }, undefined, "recent")
  }, [])

  const done = useMemo(() => {
    const finished = orders.filter((o) => DONE_STATUSES.includes(o.orderStatus))
    return {
      counts: Object.fromEntries(STATIONS.map((s) => [s.key, finished.filter((o) => matchesStation(o, s.key)).length])),
      list: finished.filter((o) => matchesStation(o, station)).sort((a, b) => doneMs(b) - doneMs(a)).slice(0, 50),
    }
  }, [orders, station])

  return (
    <div className="kq">
      <header className="kq-bar">
        <div className="kq-heading">
          <h1>Order history</h1>
          <p>The 50 most recently finished orders.</p>
        </div>
        <div className="kq-segmented" role="group" aria-label="Show">
          {STATIONS.map((s) => (
            <button key={s.key} type="button" aria-pressed={station === s.key} onClick={() => setStation(s.key)}>
              {s.label} <span className="kq-count">{done.counts[s.key]}</span>
            </button>
          ))}
        </div>
      </header>

      {!loaded ? (
        <div className="kq-ticket kq-skeleton" aria-hidden="true" />
      ) : done.list.length === 0 ? (
        <div className="kq-empty"><ChefHat size={40} strokeWidth={1.5} /><p>No finished orders yet.</p></div>
      ) : (
        <div className="ad-list">
          {done.list.map((order) => {
            const minutes = Math.max(1, Math.round((doneMs(order) - createdMs(order)) / 60000))
            const items = order.items || []
            return (
              <article key={order.id} className={`ad-row${order.orderStatus === "rejected" ? " is-muted" : ""}`}>
                <div className="ad-row-main">
                  <p className="ad-row-title">Table {order.tableNumber || "—"} · {items.map((i) => `${i.quantity || 1}× ${i.name}`).join(", ")}</p>
                  <p className="ad-row-sub">
                    {formatDateTime(doneMs(order), { dateStyle: undefined })} · took {minutes} min
                  </p>
                  {order.rejectionReason ? <p className="oc-note"><AlertTriangle size={13} /> {order.rejectionReason}</p> : null}
                </div>
                <span className={`badge ${order.orderStatus === "rejected" ? "rejected" : "approved"}`}>{STATUS_LABEL[order.orderStatus]}</span>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
