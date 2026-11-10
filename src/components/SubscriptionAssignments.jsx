import { usePlatformFeed, observeAllSubscriptions } from "../hooks/usePlatformFeed"
import { toUserMessage } from "../services/userMessages"
import { formatDateTime } from "../services/regionalSettings"
import { useMemo, useState } from "react"
import { CreditCard, Search, CheckCircle2, XCircle, AlertTriangle, Clock, RotateCcw } from "lucide-react"
import { useRBAC } from "../context/rbacContextValue"
import { ROLES } from "../services/roleService"
import {
  updateSubscriptionStatus,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_LABELS,
} from "../services/subscriptionService"
import { observePackages } from "../services/packageService"
import "../pages/superadmin.css"
import { Link } from "react-router-dom"
import { DistributionChart, FeedState } from "./PlatformCharts"
import { isSubscriptionActive } from "../services/planService"

const TABS = [
  { key: "all", label: "All" },
  { key: SUBSCRIPTION_STATUS.ACTIVE, label: "Active" },
  { key: SUBSCRIPTION_STATUS.APPROVED, label: "Approved" },
  { key: SUBSCRIPTION_STATUS.EXPIRED, label: "Expired" },
  { key: SUBSCRIPTION_STATUS.PENDING_APPROVAL, label: "Pending" },
  { key: SUBSCRIPTION_STATUS.REJECTED, label: "Rejected" },
]

const statusStyle = (status) => {
  switch (status) {
    case SUBSCRIPTION_STATUS.PENDING_APPROVAL:
      return { bg: "var(--warning-bg)", color: "var(--warning)" }
    case SUBSCRIPTION_STATUS.ACTIVE:
    case SUBSCRIPTION_STATUS.APPROVED:
      return { bg: "var(--success-bg)", color: "var(--brand-ink)" }
    case SUBSCRIPTION_STATUS.REJECTED:
      return { bg: "var(--danger-soft)", color: "var(--danger-text)" }
    case SUBSCRIPTION_STATUS.EXPIRED:
      return { bg: "var(--surface-2)", color: "var(--muted)" }
    default:
      return { bg: "var(--surface-2)", color: "var(--text-3)" }
  }
}

export function SubscriptionAssignments() {
  const { role } = useRBAC()
  const isSuperAdmin = role === ROLES.SUPERADMIN || role === "superadmin"

  const subscriptionFeed = usePlatformFeed(observeAllSubscriptions)
  const subscriptions = subscriptionFeed.data
  const [activeTab, setActiveTab] = useState("all")
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState("")
  const [actionError, setActionError] = useState("")

  const packageFeed = usePlatformFeed(observePackages)
  const packagesList = packageFeed.data
  const packageById = useMemo(() => Object.fromEntries((packagesList || []).map((p) => [p.id, p])), [packagesList])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return subscriptions.filter((s) => {
      const tabMatch = activeTab === "all" || s.status === activeTab
      const searchMatch = !q ||
        (s.customer_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (packageById[s.plan_key]?.name || "").toLowerCase().includes(q)
      return tabMatch && searchMatch
    })
  }, [subscriptions, activeTab, search, packageById])

  const counts = useMemo(() => {
    const c = { all: subscriptions.length }
    Object.values(SUBSCRIPTION_STATUS).forEach((s) => { c[s] = 0 })
    subscriptions.forEach((s) => { if (c[s.status] != null) c[s.status] += 1 })
    return c
  }, [subscriptions])

  // Active assignments grouped by the plan actually referenced in
  // subscription rows — no hardcoded tier list.
  const packageBreakdown = useMemo(() => {
    const breakdown = {}
    subscriptions.forEach((s) => {
      if (isSubscriptionActive(s)) {
        if (!breakdown[s.plan_key]) breakdown[s.plan_key] = { label: packageById[s.plan_key]?.name || s.plan_key, total: 0 }
        breakdown[s.plan_key].total += 1
      }
    })
    return Object.values(breakdown).filter((b) => b.total > 0)
  }, [subscriptions, packageById])

  const handleStatus = async (sub, status) => {
    if (!isSuperAdmin) { setActionError("Only the platform owner can update subscriptions."); return }
    setBusy(sub.id)
    try {
      await updateSubscriptionStatus(sub.id, status, role)
    } catch (err) {
      setActionError(toUserMessage(err, "Could not update subscription status."))
    } finally {
      setBusy("")
    }
  }

  if (subscriptionFeed.loading || packageFeed.loading || subscriptionFeed.error || packageFeed.error) return <FeedState loading error={subscriptionFeed.error || packageFeed.error} />

  return (
    <div className="sa-page">
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
      <p className="sa-section-intro">Review subscription history and adjust access for provisioned cafes.</p>

      <div className="sa-stats">
        {[
          { label: "Active", value: counts[SUBSCRIPTION_STATUS.ACTIVE] || 0, icon: CheckCircle2, color: "var(--brand)" },
          { label: "Expired", value: counts[SUBSCRIPTION_STATUS.EXPIRED] || 0, icon: Clock, color: "var(--muted)" },
          { label: "Pending", value: counts[SUBSCRIPTION_STATUS.PENDING_APPROVAL] || 0, icon: AlertTriangle, color: "var(--warning)" },
          { label: "Rejected", value: counts[SUBSCRIPTION_STATUS.REJECTED] || 0, icon: XCircle, color: "var(--danger)" },
        ].map((s) => (
          <article key={s.label} className="sa-stat" style={{ color: s.color, borderTop: `3px solid ${s.color}` }}>
            <div className="sa-stat-icon" style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, color: s.color }}>
              <s.icon size={22} />
            </div>
            <div>
              <strong className="sa-stat-value" style={{ color: "var(--brand-ink)" }}>{s.value}</strong>
              <span className="sa-stat-label">{s.label}</span>
            </div>
          </article>
        ))}
      </div>

      <DistributionChart title="Current assignments by package" description="Active or approved subscriptions that have not expired" items={packageBreakdown.map(item => ({ label: item.label, value: item.total }))} />

      <div className="sa-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`sa-tab ${activeTab === tab.key ? "is-active" : ""}`}
          >
            {tab.label} ({counts[tab.key] || 0})
          </button>
        ))}
      </div>

      <div className="sa-search">
        <Search size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search subscriptions" placeholder="Search by name, email, or package..."
        />
      </div>

      <section className="sa-panel-flush">
        {filtered.length === 0 ? (
          <div className="sa-empty">
            <CreditCard size={32} />
            <div>No subscriptions found.</div>
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Customer / Organization</th>
                  <th>Package</th>
                  <th>Cafe</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => {
                  const style = statusStyle(sub.status)
                  const plan = packageById[sub.plan_key]
                  const isBusy = busy === sub.id
                  return (
                    <tr key={sub.id}>
                      <td>
                        <strong style={{ color: "var(--brand-ink)", display: "block" }}>{sub.customer_name}</strong>
                        <span style={{ color: "var(--text-3)", fontSize: "0.8rem" }}>{sub.email}</span>
                      </td>
                      <td>
                        <span className="sa-package-tag">{plan?.name || sub.plan_key}</span>
                      </td>
                      <td style={{ color: "var(--brand)", fontSize: "0.84rem" }}>
                        {sub.cafe_slug ? `/${sub.cafe_slug}` : "—"}
                      </td>
                      <td>
                        <span className="sa-badge" style={{ background: style.bg, color: style.color }}>
                          {SUBSCRIPTION_STATUS_LABELS[sub.status] || sub.status}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>
                        {sub.requested_at ? formatDateTime(sub.requested_at, { timeStyle: undefined }) : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="sa-inline-actions">
                          {sub.status === SUBSCRIPTION_STATUS.PENDING_APPROVAL && <Link className="ghost-button" to="/superadmin/requests">Review request</Link>}
                          {(sub.status === SUBSCRIPTION_STATUS.ACTIVE || sub.status === SUBSCRIPTION_STATUS.APPROVED) ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStatus(sub, SUBSCRIPTION_STATUS.EXPIRED)}
                              title="Mark as expired"
                              className="danger-button"
                            >
                              <XCircle size={14} /> Expire
                            </button>
                          ) : null}
                          {(sub.cafe_slug && sub.status === SUBSCRIPTION_STATUS.EXPIRED) ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStatus(sub, SUBSCRIPTION_STATUS.ACTIVE)}
                              title="Mark as active"
                              className="primary-button"
                            >
                              <RotateCcw size={14} /> Activate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}