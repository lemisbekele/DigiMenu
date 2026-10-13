import { useMemo } from "react"
import { Link } from "react-router-dom"
import {
  Building2, Package, CreditCard, Inbox, Clock,
  CheckCircle2, XCircle, AlertTriangle, Activity, TrendingUp, ShieldCheck,
} from "lucide-react"
import { observeRegisteredCafes } from "../services/cafeService"
import { observeAuditLogs } from "../services/dataService"
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS_LABELS } from "../services/subscriptionService"
import { observePackages } from "../services/packageService"
import "./superadmin.css"
import { usePlatformFeed, observeAllSubscriptions } from "../hooks/usePlatformFeed"
import { isSubscriptionActive } from "../services/planService"
import { cafeDistribution, requestTrend } from "../services/platformMetrics"
import { DistributionChart, RequestTrend, FeedState } from "../components/PlatformCharts"

function normalizeDate(date) {
  if (!date) return ""
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  return d.toDateString()
}

function formatAction(log) {
  if (!log || !log.action) return "System Action"
  const d = log.details || {}
  const map = {
    "auth.login": "Superadmin logged in",
    "auth.logout": "Superadmin logged out",
    "subscription.request.create": `Subscription request from ${d.customerName || d.email || ""}`,
    "subscription.request.approve": `Approved subscription for ${d.customerName || d.email || ""}`,
    "subscription.request.reject": `Rejected subscription for ${d.email || ""}`,
    "subscription.account.create": `Provisioned admin account for ${d.email || ""}`,
    "subscription.status.update": `Subscription marked ${d.status || ""} for ${d.email || ""}`,
    "cafe.create": `Cafe "${d.name || ""}" registered`,
    "cafe.status.update": `Cafe "${d.name || ""}" set to ${d.status || ""}`,
    "cafe.owner.update": `Owner email updated for "${d.name || ""}"`,
    "user.create": `User "${d.email || ""}" created`,
    "user.delete": `User deleted`,
    "menuItem.create": `Menu item "${d.name || ""}" created`,
    "order.update": `Order #${(d.id || "").slice(0, 8)} updated`,
  }
  return map[log.action] || String(log.action).replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatTime(date) {
  if (!date) return ""
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

const statusStyle = (status) => {
  switch (status) {
    case SUBSCRIPTION_STATUS.PENDING_APPROVAL:
      return { bg: "var(--warning-bg)", color: "var(--warning)" }
    case SUBSCRIPTION_STATUS.ACTIVE:
    case SUBSCRIPTION_STATUS.APPROVED:
      return { bg: "var(--success-bg)", color: "var(--brand-ink)" }
    case SUBSCRIPTION_STATUS.EXPIRED:
      return { bg: "var(--surface-2)", color: "var(--muted)" }
    default:
      return { bg: "var(--danger-soft)", color: "var(--danger-text)" }
  }
}

function StatCard({ icon: Icon, label, value, sub, color, to }) {
  const body = (
    <article
      className="sa-stat"
      style={{ color, borderTop: `3px solid ${color}` }}
    >
      <div className="sa-stat-icon" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
        <Icon size={22} />
      </div>
      <div style={{ minWidth: 0 }}>
        <strong className="sa-stat-value" style={{ color: "var(--brand-ink)" }}>{value}</strong>
        <span className="sa-stat-label">{label}</span>
        {sub ? <span className="sa-stat-sub">{sub}</span> : null}
      </div>
    </article>
  )

  return to ? (
    <Link to={to} style={{ textDecoration: "none", display: "block" }}>{body}</Link>
  ) : body
}

export function SuperAdminDashboard() {
  const cafeFeed = usePlatformFeed(observeRegisteredCafes)
  const subscriptionFeed = usePlatformFeed(observeAllSubscriptions)
  const auditFeed = usePlatformFeed(observeAuditLogs)
  const packageFeed = usePlatformFeed(observePackages)
  const cafes = cafeFeed.data
  const subscriptions = subscriptionFeed.data
  const auditLogs = auditFeed.data
  const packagesList = packageFeed.data
  const loading = [cafeFeed, subscriptionFeed, packageFeed].some(feed => feed.loading)
  const error = [cafeFeed, subscriptionFeed, packageFeed].some(feed => feed.error)

  const packageById = useMemo(() => Object.fromEntries((packagesList || []).map((p) => [p.id, p])), [packagesList])

  const stats = useMemo(() => {
    const active = cafes.filter((c) => c.status === "active")
    const suspended = cafes.filter((c) => c.status === "suspended")
    const pending = subscriptions.filter((s) => s.status === SUBSCRIPTION_STATUS.PENDING_APPROVAL)
    const activeSubs = subscriptions.filter((s) => isSubscriptionActive(s))
    const expired = subscriptions.filter((s) => s.status === SUBSCRIPTION_STATUS.EXPIRED)
    const rejected = subscriptions.filter((s) => s.status === SUBSCRIPTION_STATUS.REJECTED)

    const todaySubs = subscriptions.filter((s) => {
      const d = s.requested_at || s.created_at || s.createdAtMs
      return d && normalizeDate(d) === new Date().toDateString()
    })

    return {
      totalCafes: cafes.length,
      activeCafes: active.length,
      suspendedCafes: suspended.length,
      pending,
      activeSubs,
      expired,
      rejected,
      todaySubs,
    }
  }, [cafes, subscriptions])

  const recentSubs = useMemo(() => stats.pending.slice(0, 6), [stats.pending])
  const recentCafes = useMemo(() => cafes.slice(0, 6), [cafes])
  const recentActivity = useMemo(() => auditLogs.slice(0, 8), [auditLogs])

  if (loading || error) return <FeedState loading={loading} error={error} />

  return (
    <div className="sa-page">
      <div className="sa-head">
        <h1>Platform Overview</h1>
        <p>
          Monitor the DigiMenu SaaS platform, cafes, requests, packages, and subscriptions at a glance.
        </p>
      </div>

      <div className="sa-stats">
        <StatCard icon={Building2} label="Active Cafes" value={stats.activeCafes} sub={`${stats.totalCafes} total · ${stats.suspendedCafes} suspended`} color="var(--brand)" to="/superadmin/cafes" />
        <StatCard icon={Inbox} label="Pending Requests" value={stats.pending.length} sub="Awaiting approval" color="var(--warning)" to="/superadmin/requests" />
        <StatCard icon={CreditCard} label="Active Subscriptions" value={stats.activeSubs.length} sub={`${stats.expired.length} expired · ${stats.rejected.length} rejected`} color="var(--brand)" to="/superadmin/requests?view=subscriptions" />
        <StatCard icon={ShieldCheck} label="Subscription Tiers" value={(packagesList || []).length} sub={`${(packagesList || []).map((p) => p.name || p.id).join(" · ") || "Loading packages…"}`} color="var(--info)" to="/superadmin/packages" />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.8rem", background: "var(--warning-bg)", color: "var(--warning)", padding: "6px 14px", borderRadius: 20, fontWeight: 700 }}>
          {stats.pending.length} request{stats.pending.length === 1 ? "" : "s"} awaiting review
        </span>
        <span style={{ fontSize: "0.8rem", background: "var(--success-bg)", color: "var(--brand-ink)", padding: "6px 14px", borderRadius: 20, fontWeight: 700 }}>
          {stats.todaySubs.length} request{stats.todaySubs.length === 1 ? "" : "s"} submitted today
        </span>
        <span style={{ fontSize: "0.8rem", background: "rgba(52, 130, 27, 0.1)", color: "var(--brand)", padding: "6px 14px", borderRadius: 20, fontWeight: 700 }}>
          {stats.activeCafes}/{stats.totalCafes} cafes active
        </span>
      </div>

      <div className="sa-grid-2">
        <RequestTrend items={requestTrend(subscriptions)} />
        <DistributionChart title="Cafe status" description="Current access status across registered cafes" items={cafeDistribution(cafes)} donut />
      </div>

      <div className="sa-grid-2">
        {/* PENDING REQUESTS */}
        <section className="sa-panel">
          <div className="sa-panel-title">
            <Inbox size={18} color="var(--warning)" />
            <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--brand-ink)" }}>Pending Cafe Requests</h3>
            <Link to="/superadmin/requests" className="sa-link" style={{ marginLeft: "auto" }}>View all →</Link>
          </div>
          {recentSubs.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: "0.88rem", padding: "1rem 0" }}>No requests are awaiting approval.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentSubs.map((sub) => {
                const style = statusStyle(sub.status)
                return (
                  <div key={sub.id} className="sa-list-item">
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: "var(--brand-ink)", fontSize: "0.9rem", display: "block" }}>{sub.customer_name}</strong>
                      <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>{sub.email} · {packageById[sub.plan_key]?.name || sub.plan_key}</span>
                    </div>
                    <span className="sa-badge" style={{ background: style.bg, color: style.color }}>
                      {SUBSCRIPTION_STATUS_LABELS[sub.status] || sub.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* RECENT CAFES */}
        <section className="sa-panel">
          <div className="sa-panel-title">
            <Building2 size={18} color="var(--brand)" />
            <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--brand-ink)" }}>Recently Registered Cafes</h3>
            <Link to="/superadmin/cafes" className="sa-link" style={{ marginLeft: "auto" }}>View all →</Link>
          </div>
          {recentCafes.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: "0.88rem", padding: "1rem 0" }}>No cafes registered yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentCafes.map((cafe) => {
                const isActive = cafe.status === "active"
                const isSuspended = cafe.status === "suspended"
                return (
                  <div key={cafe.id} className="sa-list-item">
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: "var(--brand-ink)", fontSize: "0.9rem", display: "block" }}>{cafe.name}</strong>
                      <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>/{cafe.slug} · {cafe.owner_email || "no owner"}</span>
                    </div>
                    {isActive ? <CheckCircle2 size={16} color="var(--brand)" /> : isSuspended ? <AlertTriangle size={16} color="var(--warning)" /> : <XCircle size={16} color="var(--danger)" />}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <section className="sa-panel">
        <div className="sa-panel-title">
          <Activity size={18} color="var(--brand)" />
          <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--brand-ink)" }}>Recent Platform Activity</h3>
        </div>
        {auditFeed.loading || auditFeed.error ? <FeedState loading={auditFeed.loading} error={auditFeed.error} /> : recentActivity.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: "0.88rem", padding: "1rem 0" }}>No recent activity.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {recentActivity.map((log) => {
              const isSuccess = ["approve", "create", "login"].some((k) => (log.action || "").includes(k))
              const isError = ["reject", "delete"].some((k) => (log.action || "").includes(k))
              return (
                <div key={log.id} className="sa-list-item">
                  {isError ? <XCircle size={16} color="var(--danger)" /> : isSuccess ? <CheckCircle2 size={16} color="var(--brand)" /> : <Clock size={16} color="var(--muted)" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: "var(--brand-ink)", fontSize: "0.88rem", display: "block" }}>{formatAction(log)}</strong>
                    <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>{log.actor || "system"}</span>
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>{formatTime(log.createdAt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="sa-quick-links">
        <Link to="/superadmin/cafes" className="sa-quick-link">
          <TrendingUp size={18} color="var(--brand)" /> Manage Cafes
        </Link>
        <Link to="/superadmin/requests" className="sa-quick-link">
          <Inbox size={18} color="var(--warning)" /> Review Requests
        </Link>
        <Link to="/superadmin/packages" className="sa-quick-link">
          <Package size={18} color="var(--info)" /> Packages
        </Link>
      </div>
    </div>
  )
}