import { dateKey, formatDateTime } from "../services/regionalSettings"
import { lastDays, reportRange } from "../services/reporting"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { money, observeOrders, observeAuditLogs } from "../services/dataService"
import { useRBAC } from "../context/rbacContextValue"
import { ROLES } from "../services/roleService"
import { useCafeSlug } from "../hooks/useCafeSlug"
import "./staff.css"

function formatTime(date) {
  if (!date) return ""
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  return formatDateTime(d, { dateStyle: undefined, timeStyle: "short" })
}

function normalizeDate(date) {
  if (!date) return ""
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  return dateKey(d)
}

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

function todayString() {
  return dateKey(new Date())
}

function Stat({ label, value, sub, text = false }) {
  return (
    <div className={`oc-stat${text ? " is-text" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <span>{sub}</span> : null}
    </div>
  )
}

function WeekBars({ days }) {
  const top = Math.max(...days.map((d) => d.value), 1)
  if (days.every((d) => d.value === 0)) return <p className="ad-row-sub">No paid orders in the last 7 days.</p>
  return (
    <div className="ad-bars" role="img" aria-label={days.map((d) => `${d.label}: ${money(d.value)}`).join(", ")}>
      {days.map((d) => (
        <div key={d.key} className="ad-bar" title={`${d.label}: ${money(d.value)} · ${d.orders} orders`}>
          <span className="ad-bar-fill" style={{ height: `${Math.max(2, (d.value / top) * 100)}%` }} />
          <span className="ad-bar-label">{d.label}</span>
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

  const stats = useMemo(() => {
    const paid = orders.filter((o) => o.orderStatus === "paid")
    const today = todayString()
    const todayPaid = paid.filter((o) => normalizeDate(o.paidAt || o.updatedAt) === today)
    return {
      openOrders: orders.filter((o) => !["paid", "rejected", "ready"].includes(o.orderStatus)).length,
      readyOrders: orders.filter((o) => o.orderStatus === "ready").length,
      monthRevenue: paid.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
      monthOrders: paid.length,
      todayRevenue: todayPaid.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
      todayOrders: orders.filter((o) => normalizeDate(o.createdAt) === today).length,
    }
  }, [orders])

  const week = useMemo(() => {
    const revenue = {}
    const counts = {}
    orders.filter((o) => o.orderStatus === "paid").forEach((o) => {
      const day = normalizeDate(o.paidAt || o.updatedAt)
      if (!day) return
      revenue[day] = (revenue[day] || 0) + Number(o.totalAmount || 0)
      counts[day] = (counts[day] || 0) + 1
    })
    return lastDays(7, todayString()).map((d) => ({ ...d, value: Math.round(revenue[d.key] || 0), orders: counts[d.key] || 0 }))
  }, [orders])

  const topItems = useMemo(() => {
    const counts = {}
    orders.forEach((o) => {
      ;(o.items || []).forEach((item) => {
        const name = item.name || "Unknown"
        counts[name] = (counts[name] || 0) + Number(item.quantity || 1)
      })
    })
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [orders])

  const calories = useMemo(() => {
    const now = new Date()
    const { from: start } = reportRange({ day: "daily", week: "weekly", month: "monthly" }[calorieRange], null, null, now)
    const inRange = orders.filter((o) => o.orderStatus === "paid").filter((o) => {
      const d = new Date(o.paidAt || o.updatedAt || o.createdAt)
      return d >= start && d <= now
    })
    let total = 0
    const perItem = {}
    inRange.forEach((o) => (o.items || []).forEach((item) => {
      const line = Math.round(Number(item.calories || 0) * Number(item.quantity || 1))
      total += line
      perItem[item.name || "Unknown"] = (perItem[item.name || "Unknown"] || 0) + line
    }))
    const ranked = Object.entries(perItem).sort((a, b) => b[1] - a[1])
    return {
      orders: inRange.length,
      total,
      average: inRange.length ? Math.round(total / inRange.length) : 0,
      highest: ranked[0]?.[0] || "—",
    }
  }, [calorieRange, orders])

  const recentOrders = useMemo(() => orders.slice(0, 6), [orders])
  const topMax = Math.max(...topItems.map((i) => i.value), 1)

  return (
    <div className="oc-page">
      <header className="oc-head">
        <div>
          <h1>{role === ROLES.MANAGER ? "Operations Dashboard" : "Business Dashboard"}</h1>
          <p>Today at a glance. Sales and best sellers cover the last 31 days.</p>
        </div>
      </header>
      {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}

      <section className="oc-stats" aria-label="Today">
        <Stat label="Sales today" value={money(stats.todayRevenue)} sub={`${stats.todayOrders} orders placed today`} />
        <Stat label="Being prepared" value={stats.openOrders} sub="Open orders right now" />
        <Stat label="Ready to serve" value={stats.readyOrders} sub="Waiting for pickup or payment" />
        <Stat label="Sales (31 days)" value={money(stats.monthRevenue)} sub={`${stats.monthOrders} paid orders`} />
      </section>

      <div className="ad-dash-grid">
        <section className="ad-section" aria-labelledby="week-heading">
          <div className="ad-section-head"><div><h2 id="week-heading">Sales, last 7 days</h2><p>Paid orders per day.</p></div></div>
          <WeekBars days={week} />
        </section>

        <section className="ad-section" aria-labelledby="top-heading">
          <div className="ad-section-head"><div><h2 id="top-heading">Best sellers</h2><p>Items ordered most, last 31 days.</p></div></div>
          {topItems.length === 0 ? <p className="ad-row-sub">No orders yet.</p> : (
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

        <section className="ad-section" aria-labelledby="orders-heading">
          <div className="ad-section-head">
            <div><h2 id="orders-heading">Latest orders</h2></div>
            <button className="oc-quiet" type="button" onClick={() => navigate(`/${cafeSlug}/orders`)}>See all</button>
          </div>
          {recentOrders.length === 0 ? <p className="ad-row-sub">No orders yet.</p> : (
            <div className="ad-list">
              {recentOrders.map((o) => (
                <div className="ad-row" key={o.id}>
                  <div className="ad-row-main">
                    <p className="ad-row-title">Table {o.tableNumber} · {money(o.totalAmount)}</p>
                    <p className="ad-row-sub">{formatTime(o.createdAt)}</p>
                  </div>
                  <span className={`badge ${o.orderStatus}`}>{o.orderStatus}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ad-section" aria-labelledby="calories-heading">
          <div className="ad-section-head">
            <div><h2 id="calories-heading">Calories sold</h2><p>From paid orders.</p></div>
            <div className="oc-chips" role="group" aria-label="Period">
              {[["day", "Today"], ["week", "Week"], ["month", "Month"]].map(([key, label]) => (
                <button key={key} type="button" className="oc-chip" aria-pressed={calorieRange === key} onClick={() => setCalorieRange(key)}>{label}</button>
              ))}
            </div>
          </div>
          {calories.orders === 0 ? <p className="ad-row-sub">No paid orders in this period.</p> : (
            <div className="oc-stats">
              <Stat label="Total" value={`${calories.total} kcal`} sub={`${calories.orders} orders`} />
              <Stat label="Per order" value={`${calories.average} kcal`} />
              <Stat label="Most calories" value={calories.highest} text />
            </div>
          )}
        </section>

        <section className="ad-section" aria-labelledby="activity-heading">
          <div className="ad-section-head"><div><h2 id="activity-heading">Recent activity</h2><p>Changes made by your team.</p></div></div>
          {auditLogs.length === 0 ? <p className="ad-row-sub">No activity yet.</p> : (
            <div className="ad-list">
              {auditLogs.map((log) => (
                <div className="ad-row" key={log.id}>
                  <div className="ad-row-main">
                    <p className="ad-row-title">{formatAuditAction(log)}</p>
                    <p className="ad-row-sub">{log.actor || "system"} · {formatTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
