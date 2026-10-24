import { dateKey, formatDateTime } from "../services/regionalSettings"
import { reportRange } from "../services/reporting"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ClipboardList, TrendingUp, Users, Clock, DollarSign,
  ShoppingCart, ChefHat, FileText, Activity, Bell,
  BarChart3, Flame
} from "lucide-react"
import { money, observeOrders, observeAuditLogs } from "../services/dataService"
import { observeCafeUsers } from "../services/dataService"
import { useRBAC } from "../context/rbacContextValue"
import { ROLES } from "../services/roleService"
import { useCafeSlug } from "../hooks/useCafeSlug"

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

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <article className="stat-card" style={{ "--stat-color": color || "var(--brand)" }}>
      <div className="stat-icon"><Icon size={22} /></div>
      <div className="stat-body">
        <strong className="stat-value">{value}</strong>
        <span className="stat-label">{label}</span>
        {sub ? <span className="stat-sub">{sub}</span> : null}
      </div>
    </article>
  )
}

function MiniBar({ items, max }) {
  if (!items || !items.length) return <div className="empty-state" style={{ margin: "8px 0", padding: 12 }}>No data yet</div>
  const top = max || Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="mini-bar-chart">
      {items.slice(0, 8).map((item, idx) => (
        <div className="mini-bar-item" key={idx} title={`${item.label}: ${item.value}`}>
          <span className="mini-bar-label">{item.label}</span>
          <div className="mini-bar-track">
            <div className="mini-bar-fill" style={{ width: `${(item.value / top) * 100}%` }} />
          </div>
          <span className="mini-bar-val">{item.value}</span>
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
  const [users, setUsers] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loadError, setLoadError] = useState("")

  useEffect(() => { return observeOrders(setOrders, setLoadError, "recent") }, [])
  useEffect(() => { if (role === ROLES.ADMIN) return observeCafeUsers(cafeSlug, setUsers) }, [cafeSlug, role])
  useEffect(() => {
    return observeAuditLogs((logs) => setAuditLogs((logs || []).slice(0, 6)), setLoadError)
  }, [])
  const stats = useMemo(() => {
    const paid = orders.filter((o) => o.orderStatus === "paid")
    const todayPaid = paid.filter((o) => normalizeDate(o.paidAt || o.updatedAt) === todayString())
    const todayAll = orders.filter((o) => normalizeDate(o.createdAt) === todayString())
    const todayCalories = todayPaid.reduce(
      (sum, o) => sum + (o.items || []).reduce((s, item) => s + Math.round(Number(item.calories || 0) * Number(item.quantity || 1)), 0),
      0,
    )
    const todayAvgCalories = todayPaid.length ? Math.round(todayCalories / todayPaid.length) : 0
    return {
      totalOrders: orders.length,
      activeOrders: orders.filter((o) => !["paid", "rejected"].includes(o.orderStatus)).length,
      readyOrders: orders.filter((o) => o.orderStatus === "ready").length,
      paidOrders: paid.length,
      totalRevenue: paid.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
      todayRevenue: todayPaid.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
      todayOrders: todayAll.length,
      todayCalories,
      todayAvgCalories,
      totalStaff: users.length,
      activeStaff: users.filter((u) => !u.disabled).length,
    }
  }, [orders, users])

  const [calorieRange, setCalorieRange] = useState("day")

  const calorieAnalytics = useMemo(() => {
    const paid = orders.filter((o) => o.orderStatus === "paid")
    const now = new Date()
    const { from: start } = reportRange({ day: "daily", week: "weekly", month: "monthly" }[calorieRange], null, null, now)
    const inRange = paid.filter((o) => {
      const d = new Date(o.paidAt || o.updatedAt || o.createdAt)
      return d >= start && d <= now
    })

    let totalCalories = 0
    const itemTotals = {}
    inRange.forEach((o) => {
      ;(o.items || []).forEach((item) => {
        const line = Math.round(Number(item.calories || 0) * Number(item.quantity || 1))
        totalCalories += line
        const name = item.name || "Unknown"
        itemTotals[name] = (itemTotals[name] || 0) + line
      })
    })

    const entries = Object.entries(itemTotals)
    let highest = null
    let lowest = null
    if (entries.length) {
      entries.sort((a, b) => b[1] - a[1])
      highest = { name: entries[0][0], calories: entries[0][1] }
      lowest = { name: entries[entries.length - 1][0], calories: entries[entries.length - 1][1] }
    }

    return {
      averageCalories: inRange.length ? Math.round(totalCalories / inRange.length) : 0,
      completedOrders: inRange.length,
      highest,
      lowest,
      totalCalories,
    }
  }, [calorieRange, orders])

  const topItems = useMemo(() => {
    const counts = {}
    orders.forEach((o) => {
      ;(o.items || []).forEach((item) => {
        const name = item.name || "Unknown"
        counts[name] = (counts[name] || 0) + Number(item.quantity || 1)
      })
    })
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }, [orders])

  const dailyRevenue = useMemo(() => {
    const map = {}
    orders.filter((o) => o.orderStatus === "paid").forEach((o) => {
      const day = normalizeDate(o.paidAt || o.updatedAt)
      if (day) map[day] = (map[day] || 0) + Number(o.totalAmount || 0)
    })
    return Object.entries(map)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .slice(-7)
      .map(([label, value]) => ({ label: label.slice(0, 6), value: Math.round(value) }))
  }, [orders])

  const dailyOrders = useMemo(() => {
    const map = {}
    orders.forEach((o) => {
      const day = normalizeDate(o.createdAt)
      if (day) map[day] = (map[day] || 0) + 1
    })
    return Object.entries(map)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .slice(-7)
      .map(([label, value]) => ({ label: label.slice(0, 6), value }))
  }, [orders])

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders])
  const recentPayments = useMemo(
    () => orders.filter((o) => o.orderStatus === "paid").slice(0, 5),
    [orders],
  )

  return (
    <div className="dashboard-page">
      {loadError ? <p className="form-error">{loadError}</p> : null}

      <div className="admin-head">
        <div>
          <p className="eyebrow">{role === ROLES.MANAGER ? "Store Manager" : "Cafe Owner"}</p>
          <h2>{role === ROLES.MANAGER ? "Operations Dashboard" : "Business Dashboard"}</h2>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon={ShoppingCart} label="Orders (31 days)" value={stats.totalOrders} color="var(--brand)" />
        <StatCard icon={Activity} label="Active Orders" value={stats.activeOrders} color="var(--warning)" />
        <StatCard icon={ChefHat} label="Ready" value={stats.readyOrders} color="var(--brand-ink)" />
        <StatCard icon={ClipboardList} label="Paid" value={stats.paidOrders} color="var(--brand-ink)" />
        <StatCard icon={DollarSign} label="Total Revenue" value={money(stats.totalRevenue)} color="var(--brand)" />
        <StatCard icon={Clock} label="Today's Revenue" value={money(stats.todayRevenue)} sub={`${stats.todayOrders} orders today`} color="var(--warning)" />
        <StatCard icon={Flame} label="Calories Sold Today" value={stats.todayCalories ? `${stats.todayCalories} kcal` : "0 kcal"} sub={stats.todayAvgCalories ? `Avg ${stats.todayAvgCalories} kcal / order` : undefined} color="var(--warning)" />
        {role === ROLES.ADMIN ? <StatCard icon={Users} label="Total Staff" value={stats.totalStaff} color="var(--brand-ink)" /> : null}
        {role === ROLES.ADMIN ? <StatCard icon={Users} label="Active Staff" value={stats.activeStaff} sub={stats.totalStaff - stats.activeStaff > 0 ? `${stats.totalStaff - stats.activeStaff} disabled` : undefined} color="var(--brand-ink)" /> : null}
      </div>

      <div className="dashboard-panels">
        <section className="dash-panel">
          <div className="dash-panel-head">
            <TrendingUp size={18} />
            <h3>Revenue (7 days)</h3>
          </div>
          <MiniBar items={dailyRevenue} />
        </section>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <BarChart3 size={18} />
            <h3>Orders (7 days)</h3>
          </div>
          <MiniBar items={dailyOrders} />
        </section>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <FileText size={18} />
            <h3>Top Items</h3>
          </div>
          <MiniBar items={topItems} />
        </section>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <Flame size={18} />
            <h3>Calorie Analytics</h3>
          </div>
          <div className="segmented-control" role="group" aria-label="Calorie analytics period">
            {["day", "week", "month"].map((period) => (
              <button
                type="button"
                key={period}
                className={calorieRange === period ? "active" : ""}
                onClick={() => setCalorieRange(period)}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
            ))}
          </div>
          {calorieAnalytics.completedOrders === 0 ? (
            <div className="empty-state" style={{ margin: "8px 0", padding: 12 }}>
              <Flame size={18} />
              <p>No calorie data for this period</p>
            </div>
          ) : (
            <div className="calorie-stats-list">
              <div className="activity-row">
                <div>
                  <strong>Total Calories Purchased</strong>
                  <span className="stat-sub">{calorieAnalytics.completedOrders} completed orders</span>
                </div>
                <strong className="calorie-stat-val">{calorieAnalytics.totalCalories} kcal</strong>
              </div>
              <div className="activity-row">
                <div>
                  <strong>Average Calories per Order</strong>
                  <span className="stat-sub">Across selected period</span>
                </div>
                <strong className="calorie-stat-val">{calorieAnalytics.averageCalories} kcal</strong>
              </div>
              <div className="activity-row">
                <div>
                  <strong>Highest Calorie Item</strong>
                  <span className="stat-sub">{calorieAnalytics.highest?.name || "—"}</span>
                </div>
                <strong className="calorie-stat-val">{calorieAnalytics.highest?.calories || 0} kcal</strong>
              </div>
              <div className="activity-row">
                <div>
                  <strong>Lowest Calorie Item</strong>
                  <span className="stat-sub">{calorieAnalytics.lowest?.name || "—"}</span>
                </div>
                <strong className="calorie-stat-val">{calorieAnalytics.lowest?.calories || 0} kcal</strong>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-panels two-col-grid">
        <section className="dash-panel">
          <div className="dash-panel-head">
            <Clock size={18} />
            <h3>Recent Orders</h3>
          </div>
          {recentOrders.length === 0 ? (
            <div className="empty-state" style={{ margin: "8px 0", padding: 12 }}>No orders yet</div>
          ) : (
            <div className="activity-list">
              {recentOrders.map((o) => (
                <div className="activity-row" key={o.id} onClick={() => navigate(`/${cafeSlug}/orders`)}>
                  <div>
                    <strong>Table {o.tableNumber}</strong>
                    <span className="stat-sub">{money(o.totalAmount)}</span>
                  </div>
                  <span className={`badge ${o.orderStatus}`}>{o.orderStatus}</span>
                  <span className="activity-time">{formatTime(o.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <DollarSign size={18} />
            <h3>Recent Payments</h3>
          </div>
          {recentPayments.length === 0 ? (
            <div className="empty-state" style={{ margin: "8px 0", padding: 12 }}>No payments yet</div>
          ) : (
            <div className="activity-list">
              {recentPayments.map((o) => (
                <div className="activity-row" key={o.id}>
                  <div>
                    <strong>Table {o.tableNumber}</strong>
                    <span className="stat-sub">{money(o.totalAmount)}</span>
                  </div>
                  <span className="badge paid">Paid</span>
                  <span className="activity-time">{formatTime(o.paidAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>



        <section className="dash-panel">
          <div className="dash-panel-head">
            <Activity size={18} />
            <h3>Recent Activity</h3>
          </div>
          {auditLogs.length === 0 ? (
            <div className="empty-state" style={{ margin: "8px 0", padding: 12 }}>No activity yet</div>
          ) : (
            <div className="activity-list">
              {auditLogs.map((log) => (
                <div className="activity-row" key={log.id}>
                  <div>
                    <strong>{formatAuditAction(log)}</strong>
                    <span className="stat-sub">{log.actor || "system"}</span>
                  </div>
                  <span className="activity-time">{formatTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <Bell size={18} />
            <h3>Notifications</h3>
          </div>
          <div className="empty-state" style={{ margin: "8px 0", padding: 12 }}>
            No new notifications
          </div>
        </section>
      </div>

      {/* APPROVAL CREDENTIALS MODAL */}
    </div>
  )
}
