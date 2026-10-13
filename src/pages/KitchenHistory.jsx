import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Clock,
  Coffee,
  Filter,
  Settings,
  Utensils,
  XCircle,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { observeOrders } from "../services/dataService"

const STATIONS = [
  { key: "all", label: "All Items", icon: Filter },
  { key: "kitchen", label: "Kitchen Staff", icon: Utensils },
  { key: "barista", label: "Barista", icon: Coffee },
]

const DONE_STATUSES = ["ready", "paid", "rejected"]

const DRINK_KEYWORDS = [
  "coffee",
  "latte",
  "espresso",
  "cappuccino",
  "macchiato",
  "tea",
  "matcha",
  "smoothie",
  "juice",
  "beverage",
  "drink",
  "cold brew",
  "iced",
  "frappe",
  "milkshake",
  "soda",
  "water",
  "cocktail",
  "barista",
  "mocha",
  "americano",
  "flat white",
  "cortado",
  "brew",
  "beverages",
  "drinks",
  "chai",
  "drip",
  "pour over",
]

function isBaristaItem(item) {
  if (!item) return false
  const categoryStr = (item.category || "").toLowerCase()
  const subcategoryStr = (item.subcategory || "").toLowerCase()
  const nameStr = (item.name || "").toLowerCase()

  if (
    categoryStr.includes("drink") ||
    categoryStr.includes("beverage") ||
    categoryStr.includes("coffee") ||
    categoryStr.includes("barista") ||
    categoryStr.includes("tea")
  ) {
    return true
  }

  const haystack = `${nameStr} ${categoryStr} ${subcategoryStr}`
  return DRINK_KEYWORDS.some((kw) => haystack.includes(kw))
}

function matchesStation(order, stationFilter) {
  if (stationFilter === "all") return true
  const items = order.items || []
  if (stationFilter === "barista") return items.some((i) => isBaristaItem(i))
  if (stationFilter === "kitchen") return items.some((i) => !isBaristaItem(i))
  return true
}

function orderCreatedMs(order) {
  if (order.createdAtMs) return order.createdAtMs
  if (order.createdAt?.toDate) return order.createdAt.toDate().getTime()
  return new Date(order.createdAt || Date.now()).getTime()
}

function orderCompletedMs(order) {
  const pick = (v) => {
    if (!v) return null
    if (typeof v === "object" && v?.toDate) return v.toDate().getTime()
    if (typeof v === "number" && String(v).length > 9) return v
    const ms = new Date(v).getTime()
    return Number.isNaN(ms) ? null : ms
  }
  return (
    pick(order.rejectedAt) ??
    pick(order.paidAt) ??
    pick(order.readyAt) ??
    pick(order.completedAt) ??
    pick(order.updatedAt) ??
    orderCreatedMs(order)
  )
}

function HistorySkeleton() {
  return (
    <div className="kds-ticket kds-ticket-skeleton">
      <div className="kds-skel-line" style={{ width: "45%", height: 28 }} />
      <div className="kds-skel-line" style={{ width: "75%", height: 16 }} />
      <div className="kds-skel-line" style={{ width: "55%", height: 16 }} />
    </div>
  )
}

export function KitchenHistory() {
  const cafeSlug = useCafeSlug()
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [stationFilter, setStationFilter] = useState("all")

  useEffect(() => {
    return observeOrders((nextOrders) => {
      setOrders(nextOrders)
      if (!loaded) setLoaded(true)
    })
  }, [loaded])

  const completedOrders = useMemo(() => {
    const done = orders.filter((o) => DONE_STATUSES.includes(o.orderStatus))
    const filtered = done.filter((o) => matchesStation(o, stationFilter))
    return filtered.sort((a, b) => orderCompletedMs(b) - orderCompletedMs(a)).slice(0, 50)
  }, [orders, stationFilter])

  return (
    <div className="kds-root">
      <header className="kds-header">
        <div className="kds-header-title">
          <Link to=".." relative="path" className="kds-header-btn" aria-label="Back to Kitchen">
            <ChefHat size={22} />
          </Link>
          <div>
            <h1>Order History</h1>
            <span className="kds-subtitle">{completedOrders.length} completed orders</span>
          </div>
        </div>
        <div className="kds-header-actions">
          <Link to={`/${cafeSlug}/kds/settings`} className="kds-header-btn" aria-label="Settings">
            <Settings size={20} />
          </Link>
        </div>
      </header>

      <div className="kds-station-bar">
        <div className="kds-station-pills" role="tablist" aria-label="Select Station">
          {STATIONS.map((st) => {
            const Icon = st.icon
            const isActive = stationFilter === st.key
            return (
              <button
                key={st.key}
                type="button"
                className={`kds-station-pill ${isActive ? "kds-station-active" : ""}`}
                onClick={() => setStationFilter(st.key)}
                role="tab"
                aria-selected={isActive}
              >
                <Icon size={16} />
                <span>{st.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="kds-history-view">
        <div className="kds-col-header">
          <h2>History</h2>
          <span className="kds-col-count">{completedOrders.length}</span>
        </div>
        <div className="kds-col-body">
          {!loaded ? (
            <>
              <HistorySkeleton />
              <HistorySkeleton />
            </>
          ) : completedOrders.length === 0 ? (
            <div className="kds-empty">
              <ChefHat size={48} strokeWidth={1.5} />
              <p>
                {stationFilter === "all"
                  ? "No completed orders yet"
                  : `No completed ${stationFilter} orders yet`}
              </p>
            </div>
          ) : (
            completedOrders.map((order) => {
              const doneMs = orderCompletedMs(order)
              const minutes = Math.max(
                1,
                Math.round((doneMs - orderCreatedMs(order)) / 60000),
              )
              const status = order.orderStatus
              return (
                <article
                  key={order.id}
                  className={`kds-ticket kds-history-ticket status-${status}`}
                >
                  <div className="kds-ticket-head">
                    <div className="kds-ticket-meta">
                      <span className="kds-ticket-table">
                        Table {order.tableNumber || "Takeout"}
                      </span>
                      <span className="kds-ticket-id">#{String(order.id).slice(-5)}</span>
                    </div>
                    <span className="kds-history-status">{status}</span>
                  </div>
                  <div className="kds-history-meta">
                    <span className="kds-history-done">
                      {status === "rejected" ? (
                        <XCircle size={12} />
                      ) : (
                        <CheckCircle2 size={12} />
                      )}
                      {status === "rejected"
                        ? `Rejected · ${formatDateTime(doneMs, { dateStyle: undefined })}`
                        : `Completed · ${formatDateTime(doneMs, { dateStyle: undefined })}`}
                    </span>
                    <span className="kds-history-time">
                      <Clock size={12} /> {minutes} min
                    </span>
                  </div>
                  <ul className="kds-ticket-items kds-history-items">
                    {(order.items || []).slice(0, 5).map((item, i) => (
                      <li key={i} className="kds-ticket-item">
                        <span className="kds-ticket-qty">{item.quantity || 1}x</span>
                        <span className="kds-ticket-name">{item.name}</span>
                      </li>
                    ))}
                    {(order.items || []).length > 5 ? (
                      <li className="kds-history-more">
                        +{(order.items || []).length - 5} more items
                      </li>
                    ) : null}
                  </ul>
                  {order.rejectionReason ? (
                    <p className="kds-ticket-note">
                      <AlertTriangle size={12} /> {order.rejectionReason}
                    </p>
                  ) : null}
                </article>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
