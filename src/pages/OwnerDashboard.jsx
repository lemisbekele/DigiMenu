import { dateKey, formatDateTime } from "../services/regionalSettings"
import { lastDays, reportRange } from "../services/reporting"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Wallet, Receipt, Flame, BellRing, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"
import { money, observeOrders, observeAuditLogs } from "../services/dataService"
import { useRBAC } from "../context/rbacContextValue"
import { ROLES } from "../services/roleService"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { DataTable, EmptyState, PageHeader, StatusPill, toneForStatus } from "../ui"
import "./staff-layout.css"

const STATUS_LABEL = { received: "In line", accepted: "In line", preparing: "Preparing", ready: "Ready", paid: "Paid", rejected: "Rejected" }

function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? null : d
}
const dayOf = (value) => { const d = toDate(value); return d ? dateKey(d) : "" }
const timeOf = (value) => { const d = toDate(value); return d ? formatDateTime(d, { dateStyle: undefined, timeStyle: "short" }) : "" }
const total = (list) => list.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0)

function formatAuditAction(log) {
  if (!log || !log.action) return "Activity recorded"
  const d = log.details || {}
  const map = {
    "auth.login": "Logged in",
    "auth.logout": "Logged out",
    "order.payment.processed": `Payment processed for Table ${d.tableNumber || ""}`,
    "order.update": `Order #${d.id?.slice(0, 8) || ""} updated`,
    "order.paymentProof.upload": `Payment proof uploaded for order #${d.id?.slice(0, 8) || ""}`,
    "menuItem.create": `Menu item "${d.name || ""}" created`,
    "menuItem.update": `Menu item "${d.name || ""}" updated`,
    "menuItem.delete": `Menu item "${d.name || ""}" deleted`,
    "menuItem.availability": `"${d.name || ""}" marked ${d.available ? "available" : "unavailable"}`,
    "table.create": `Table ${d.tableNumber || ""} added`,
    "table.update": `Table ${d.tableNumber || ""} updated`,
    "table.delete": `Table ${d.tableNumber || ""} removed`,
    "paymentOption.create": `Payment method "${d.name || ""}" added`,
    "paymentOption.update": `Payment method "${d.name || ""}" updated`,
    "paymentOption.delete": `Payment method "${d.name || ""}" removed`,
    "settings.billing.update": "Billing settings updated",
    "user.create": `User "${d.email || ""}" created`,
    "subscription.request.create": `Subscription request submitted for ${d.customerName || ""}`,
    "subscription.request.approve": `Subscription approved for ${d.customerName || ""}`,
    "subscription.request.reject": `Subscription request rejected for ${d.email || ""}`,
    "subscription.account.create": `Admin account provisioned for ${d.email || ""}`,
  }
  return map[log.action] || String(log.action).replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// Change against a comparison value, worded for people: "Up 12% on last Friday".
export function trendOf(now, before, against) {
  if (!before && !now) return { dir: "flat", text: `Same as ${against}` }
  if (!before) return { dir: "up", text: `New since ${against}` }
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return { dir: "flat", text: `Same as ${against}` }
  return { dir: pct > 0 ? "up" : "down", text: `${pct > 0 ? "Up" : "Down"} ${Math.abs(pct)}% on ${against}` }
}

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }

function Kpi({ icon: Icon, label, value, trend, note }) {
  const TrendIcon = trend ? TREND_ICON[trend.dir] : null
  return (
    <article className="ui-card kpi">
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon" aria-hidden="true"><Icon size={16} /></span>
      </div>
      <strong className="kpi-value">{value}</strong>
      {trend ? (
        <span className="kpi-trend" data-dir={trend.dir}><TrendIcon size={14} aria-hidden="true" />{trend.text}</span>
      ) : <span className="kpi-trend" data-dir="flat">{note}</span>}
    </article>
  )
}

function WeekChart({ days }) {
  const top = Math.max(...days.map((d) => d.value), 1)
  if (days.every((d) => d.value === 0)) return <EmptyState title="No paid orders this week" body="Sales appear here as orders are paid." />
  return (
    <div className="week-chart" role="img" aria-label={days.map((d) => `${d.label}: ${money(d.value)}`).join(", ")}>
      {days.map((d, i) => (
        <div key={d.key} className="week-bar" data-today={i === days.length - 1 || undefined} title={`${d.label}: ${money(d.value)} · ${d.orders} orders`}>
          <span className="week-bar-value">{d.value ? money(d.value) : ""}</span>
          <span className="week-bar-track"><span className="week-bar-fill" style={{ height: `${Math.max(3, (d.value / top) * 100)}%` }} /></span>
          <span className="week-bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function OwnerDashboard() {
  const navigate = useNavigate()
  const cafeSlug = useCafeSlug()
  const { role } = useRBAC()

  const [orders, setOrders] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loadError, setLoadError] = useState("")
  const [calorieRange, setCalorieRange] = useState("day")

  useEffect(() => { return observeOrders(setOrders, setLoadError, "recent") }, [])
  useEffect(() => {
    return observeAuditLogs((logs) => setAuditLogs((logs || []).slice(0, 6)), setLoadError)
  }, [])

  const days = useMemo(() => lastDays(15, dateKey(new Date())), [])

  const kpis = useMemo(() => {
    const paid = orders.filter((o) => o.orderStatus === "paid")
    const today = days[14].key
    const lastWeekDay = days[7].key
    const thisWeek = new Set(days.slice(8).map((d) => d.key))
    const prevWeek = new Set(days.slice(1, 8).map((d) => d.key))
    const paidOn = (key) => paid.filter((o) => dayOf(o.paidAt || o.updatedAt) === key)
    const paidIn = (set) => paid.filter((o) => set.has(dayOf(o.paidAt || o.updatedAt)))
    const placedOn = (key) => orders.filter((o) => dayOf(o.createdAt) === key).length
    const avg = (list) => (list.length ? total(list) / list.length : 0)
    const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })
    return {
      salesToday: total(paidOn(today)),
      salesTrend: trendOf(total(paidOn(today)), total(paidOn(lastWeekDay)), `last ${weekday}`),
      ordersToday: placedOn(today),
      ordersTrend: trendOf(placedOn(today), placedOn(lastWeekDay), `last ${weekday}`),
      avgOrder: avg(paidIn(thisWeek)),
      avgTrend: trendOf(avg(paidIn(thisWeek)), avg(paidIn(prevWeek)), "the week before"),
      open: orders.filter((o) => !["paid", "rejected", "ready"].includes(o.orderStatus)).length,
      ready: orders.filter((o) => o.orderStatus === "ready").length,
    }
  }, [orders, days])

  const week = useMemo(() => {
    const revenue = {}
    const counts = {}
    orders.filter((o) => o.orderStatus === "paid").forEach((o) => {
      const day = dayOf(o.paidAt || o.updatedAt)
      if (!day) return
      revenue[day] = (revenue[day] || 0) + Number(o.totalAmount || 0)
      counts[day] = (counts[day] || 0) + 1
    })
    return days.slice(8).map((d) => ({ ...d, value: Math.round(revenue[d.key] || 0), orders: counts[d.key] || 0 }))
  }, [orders, days])
  const weekTotal = week.reduce((s, d) => s + d.value, 0)

  const topItems = useMemo(() => {
    const counts = {}
    orders.forEach((o) => (o.items || []).forEach((item) => {
      const name = item.name || "Unknown"
      counts[name] = (counts[name] || 0) + Number(item.quantity || 1)
    }))
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [orders])
  const topMax = Math.max(...topItems.map((i) => i.value), 1)

  const calories = useMemo(() => {
    const now = new Date()
    const { from: start } = reportRange({ day: "daily", week: "weekly", month: "monthly" }[calorieRange], null, null, now)
    const inRange = orders.filter((o) => o.orderStatus === "paid").filter((o) => {
      const d = new Date(o.paidAt || o.updatedAt || o.createdAt)
      return d >= start && d <= now
    })
    let sum = 0
    inRange.forEach((o) => (o.items || []).forEach((item) => { sum += Math.round(Number(item.calories || 0) * Number(item.quantity || 1)) }))
    return { orders: inRange.length, total: sum, average: inRange.length ? Math.round(sum / inRange.length) : 0 }
  }, [calorieRange, orders])

  const orderColumns = [
    { key: "table", label: "Table", render: (o) => <strong>{o.tableNumber ? `Table ${o.tableNumber}` : "Take away"}</strong> },
    { key: "items", label: "Items", render: (o) => {
      const text = (o.items || []).map((i) => `${i.quantity || 1}× ${i.name}`).join(", ")
      return <span className="ui-muted" title={text}>{text}</span>
    } },
    { key: "time", label: "Placed", render: (o) => <span className="ui-num">{timeOf(o.createdAt)}</span> },
    { key: "status", label: "Status", render: (o) => <StatusPill tone={toneForStatus(o.orderStatus)}>{STATUS_LABEL[o.orderStatus] || o.orderStatus}</StatusPill> },
    { key: "total", label: "Total", align: "right", render: (o) => money(o.totalAmount) },
  ]

  return (
    <div className="ui-stack dash">
      <PageHeader
        title={role === ROLES.MANAGER ? "Operations" : "Dashboard"}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        action={<button className="ui-btn ui-btn--primary" type="button" onClick={() => navigate(`/${cafeSlug}/orders`)}>Open orders</button>}
      />
      {loadError ? <p className="ui-error" role="alert">{loadError}</p> : null}

      <section className="kpis" aria-label="Today">
        <Kpi icon={Wallet} label="Sales today" value={money(kpis.salesToday)} trend={kpis.salesTrend} />
        <Kpi icon={Receipt} label="Orders today" value={kpis.ordersToday} trend={kpis.ordersTrend} />
        <Kpi icon={Flame} label="Average order, 7 days" value={money(kpis.avgOrder)} trend={kpis.avgTrend} />
        <Kpi icon={BellRing} label="Open now" value={kpis.open} note={kpis.ready ? `${kpis.ready} ready to serve` : "Nothing waiting to serve"} />
      </section>

      <div className="dash-row">
        <section className="ui-card ui-card--stack dash-wide" aria-labelledby="week-heading">
          <div className="ui-section-head">
            <div><h2 id="week-heading">Sales this week</h2><p>Paid orders per day</p></div>
            <strong className="dash-figure ui-num">{money(weekTotal)}</strong>
          </div>
          <WeekChart days={week} />
        </section>

        <section className="ui-card ui-card--stack" aria-labelledby="top-heading">
          <div className="ui-section-head"><div><h2 id="top-heading">Best sellers</h2><p>Items ordered most</p></div></div>
          {topItems.length === 0 ? <EmptyState title="No orders yet" /> : (
            <ol className="ad-rank">
              {topItems.map((item) => (
                <li key={item.label}>
                  <span className="ad-rank-name">{item.label}</span>
                  <span className="ad-rank-bar"><span style={{ width: `${(item.value / topMax) * 100}%` }} /></span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="dash-row">
        <section className="ui-stack dash-wide" aria-labelledby="orders-heading">
          <div className="ui-section-head">
            <div><h2 id="orders-heading">Latest orders</h2></div>
            <button className="ui-btn" type="button" onClick={() => navigate(`/${cafeSlug}/orders`)}>See all</button>
          </div>
          <DataTable columns={orderColumns} rows={orders.slice(0, 6)} rowKey="id" empty={{ title: "No orders yet", body: "Orders from tables appear here as they come in." }} />
        </section>

        <div className="ui-stack">
          <section className="ui-card ui-card--stack" aria-labelledby="calories-heading">
            <div className="ui-section-head">
              <div><h2 id="calories-heading">Calories sold</h2></div>
              <div className="ui-seg" role="group" aria-label="Period">
                {[["day", "Today"], ["week", "Week"], ["month", "Month"]].map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={calorieRange === key} onClick={() => setCalorieRange(key)}>{label}</button>
                ))}
              </div>
            </div>
            {calories.orders === 0 ? <p className="ui-muted">No paid orders in this period.</p> : (
              <div className="dash-pair">
                <div><span className="ui-muted">Total</span><strong className="ui-num">{calories.total.toLocaleString()} kcal</strong></div>
                <div><span className="ui-muted">Per order</span><strong className="ui-num">{calories.average} kcal</strong></div>
              </div>
            )}
          </section>

          <section className="ui-card ui-card--stack" aria-labelledby="activity-heading">
            <div className="ui-section-head"><div><h2 id="activity-heading">Recent activity</h2></div></div>
            {auditLogs.length === 0 ? <p className="ui-muted">No activity yet.</p> : (
              <ul className="activity">
                {auditLogs.map((log) => (
                  <li key={log.id}>
                    <span className="ui-truncate">{formatAuditAction(log)}</span>
                    <small className="ui-muted">{log.actor || "system"} · {timeOf(log.createdAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
