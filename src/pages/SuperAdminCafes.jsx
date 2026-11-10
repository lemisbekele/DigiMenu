import { DistributionChart, FeedState } from "../components/PlatformCharts"
import { useConfirm } from "../hooks/useConfirm"
import { cafeDistribution } from "../services/platformMetrics"
import { isSubscriptionActive } from "../services/planService"
import { toUserMessage } from "../services/userMessages"
import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useState } from "react"
import { Building2, Search, CheckCircle2, XCircle, AlertTriangle, Pencil, Package, ExternalLink, Trash2 } from "lucide-react"
import { fetchRegisteredCafes, observeRegisteredCafes, updateCafeStatus, updateCafeOwnerEmail, deleteCafe } from "../services/cafeService"
import { observeSubscriptionRequests, assignPackageToCafe } from "../services/subscriptionService"
import { observePackages } from "../services/packageService"
import "./superadmin.css"

const TABS = [
  { key: "all", label: "All Cafes" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
]

const statusLabel = (status) => {
  switch (status) {
    case "active": return { text: "Active", bg: "var(--success-bg)", color: "var(--brand-ink)" }
    case "suspended": return { text: "Suspended", bg: "var(--warning-bg)", color: "var(--warning)" }
    case "pending": return { text: "Pending", bg: "var(--warning-bg)", color: "var(--warning)" }
    case "rejected": return { text: "Rejected", bg: "var(--danger-soft)", color: "var(--danger-text)" }
    default: return { text: status || "Active", bg: "var(--surface-2)", color: "var(--text-3)" }
  }
}

export function SuperAdminCafes() {
  const [confirm, confirmDialog] = useConfirm()
  const [cafes, setCafes] = useState([])
  const [cafesLoading, setCafesLoading] = useState(true)
  const [cafesError, setCafesError] = useState(false)
  const [activeTab, setActiveTab] = useState("all")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [ownerModal, setOwnerModal] = useState(null)
  const [ownerEmail, setOwnerEmail] = useState("")
  const [packageModal, setPackageModal] = useState(null)
  const [selectedPlanKey, setSelectedPlanKey] = useState("")
  const [subscriptions, setSubscriptions] = useState([])
  const [packagesList, setPackagesList] = useState([])
  const [notice, setNotice] = useState(null)

  const load = async () => {
    const data = await fetchRegisteredCafes()
    setCafes(data || [])
  }

  useEffect(() => { return observeRegisteredCafes((data) => { setCafes(data || []); setCafesLoading(false); setCafesError(false) }, () => { setCafesLoading(false); setCafesError(true) }) }, [])
  useEffect(() => { return observeSubscriptionRequests((data) => setSubscriptions(data || [])) }, [])
  useEffect(() => { return observePackages((data) => setPackagesList(data || [])) }, [])

  const packageByKey = useMemo(() => {
    const map = {}
    packagesList.forEach((p) => { map[p.id] = p })
    return map
  }, [packagesList])

  const subscriptionByCafe = useMemo(() => {
    const map = {}
    subscriptions.forEach((s) => {
      if (isSubscriptionActive(s) && s.cafe_slug) {
        map[(s.cafe_slug || "").toLowerCase()] = s
      }
    })
    return map
  }, [subscriptions])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return cafes.filter((c) => {
      const tabMatch = activeTab === "all" || (c.status || "active") === activeTab
      const searchMatch = !q ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.slug || "").toLowerCase().includes(q) ||
        (c.owner_email || "").toLowerCase().includes(q)
      return tabMatch && searchMatch
    })
  }, [cafes, activeTab, search])

  const counts = useMemo(() => {
    const c = { all: cafes.length, active: 0, suspended: 0 }
    cafes.forEach((cafe) => {
      const s = cafe.status || "active"
      if (s === "active") c.active += 1
      if (s === "suspended") c.suspended += 1
    })
    return c
  }, [cafes])

  const handleStatus = async (cafe, status) => {
    setLoading(true)
    try {
      await updateCafeStatus(cafe.id, status)
      await load()
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not update cafe status.") })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (cafe) => {
    const confirmed = await confirm(`This removes its profile, subscription, tenant data, stored files, and every associated user account (including the owner's login). This cannot be undone.`, { title: `Permanently delete ${cafe.name}?`, confirmLabel: "Delete cafe" })
    if (!confirmed) return
    setLoading(true)
    setNotice(null)
    try {
      const { summary, filesRemoved, cleanupPending } = await deleteCafe(cafe.id)
      await load()
      const users = summary?.usersDeleted ?? 0
      setNotice({
        type: cleanupPending ? "error" : "success",
        text: `${cafe.name} was deleted: ${users} user account${users === 1 ? "" : "s"} and ${filesRemoved || 0} file${filesRemoved === 1 ? "" : "s"} removed.${cleanupPending ? " Some stored files still need cleanup. Contact platform support with cafe ID " + cafe.id + "." : " Tenant record deletion verified."}`,
      })
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not delete cafe.") })
    } finally {
      setLoading(false)
    }
  }

  const saveOwnerEmail = async () => {
    if (!ownerModal || loading) return
    setLoading(true)
    try {
      await updateCafeOwnerEmail(ownerModal.id, ownerEmail)
      await load()
      setOwnerModal(null)
      setOwnerEmail("")
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not update owner email.") })
    } finally { setLoading(false) }
  }

  const confirmPackageChange = async () => {
    if (!packageModal || !selectedPlanKey) return
    setLoading(true)
    setNotice(null)
    try {
      await assignPackageToCafe({ cafeSlug: packageModal.slug, planKey: selectedPlanKey })
      setNotice({
        type: "success",
        text: `${packageModal.name} is now on the "${selectedPlanKey}" package. The cafe's routes, navigation and backend permissions update immediately.`,
      })
      setPackageModal(null)
      setSelectedPlanKey("")
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not change package.") })
    } finally {
      setLoading(false)
    }
  }

  if (cafesLoading || cafesError) return <FeedState loading={cafesLoading} error={cafesError} />

  return (
    <div className="sa-page sa-cafes-page">
      {confirmDialog}
      <div className="sa-head">
        <h1>Cafe Management</h1>
        <p>
          View all registered cafes, manage their access status, update owner contact details, and change the package each cafe is entitled to.
        </p>
      </div>

      {notice && (
        <div className={`sa-alert ${notice.type === "success" ? "sa-alert-success" : "sa-alert-error"}`} style={{ marginBottom: "1.25rem" }}>
          {notice.text}
        </div>
      )}

      <div className="sa-stats">
        {[
          { label: "Total Cafes", value: counts.all, icon: Building2, color: "var(--brand)" },
          { label: "Active", value: counts.active, icon: CheckCircle2, color: "var(--brand)" },
          { label: "Suspended", value: counts.suspended, icon: AlertTriangle, color: "var(--warning)" },
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

      <DistributionChart title="Cafe access at a glance" description="Current status of registered cafes" items={cafeDistribution(cafes)} />

      <div className="sa-page-toolbar">
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
            placeholder="Search by name, slug, or owner email..."
          />
        </div>
      </div>

      <section className="sa-panel-flush">
        {filtered.length === 0 ? (
          <div className="sa-empty">
            <Building2 size={32} />
            <div>No cafes found.</div>
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Cafe</th>
                  <th>Slug / URL</th>
                  <th>Owner Email</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cafe) => {
                  const s = statusLabel(cafe.status || "active")
                  const isActive = (cafe.status || "active") === "active"
                  const sub = subscriptionByCafe[(cafe.slug || "").toLowerCase()]
                  const pkg = sub ? packageByKey[sub.plan_key] : null
                  return (
                    <tr key={cafe.id}>
                      <td data-label="Cafe">
                        <strong style={{ color: "var(--brand-ink)", display: "flex", alignItems: "center", gap: 8 }}>{cafe.name}</strong>
                      </td>
                      <td data-label="Slug / URL">
                        <a
                          href={`/${cafe.slug}/menu`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--brand)", fontSize: "0.85rem", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
                          title="Open Customer Menu"
                        >
                          /{cafe.slug} <ExternalLink size={12} />
                        </a>
                      </td>
                      <td data-label="Owner Email" style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>{cafe.owner_email || "—"}</td>
                      <td data-label="Package">
                        {pkg ? (
                          <span className="sa-badge" style={{ background: "var(--info-bg)", color: pkg.id === "enterprise" ? "var(--info)" : "var(--info)" }}>
                            {pkg.name || pkg.id}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No active package</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className="sa-badge" style={{ background: s.bg, color: s.color }}>{s.text}</span>
                      </td>
                      <td data-label="Created" style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>
                        {cafe.created_at ? formatDateTime(cafe.created_at, { timeStyle: undefined }) : "—"}
                      </td>
                      <td data-label="Actions" style={{ textAlign: "right" }}>
                        <div className="sa-inline-actions">
                          <a
                            href={`/${cafe.slug}/menu`}
                            target="_blank"
                            rel="noreferrer"
                            className="ghost-button compact-btn"
                            title="Open Live Menu"
                            style={{ textDecoration: "none" }}
                          >
                            <ExternalLink size={14} /> Open Menu
                          </a>
                          <button
                            type="button"
                            title="Change assigned package"
                            onClick={() => { setPackageModal(cafe); setSelectedPlanKey(sub?.plan_key || "") }}
                            className="ghost-button compact-btn"
                          >
                            <Package size={14} /> Package
                          </button>
                          <button
                            type="button"
                            title="Edit owner email"
                            onClick={() => { setOwnerModal(cafe); setOwnerEmail(cafe.owner_email || "") }}
                            className="ghost-button compact-btn"
                          >
                            <Pencil size={14} /> Owner
                          </button>
                          {isActive ? (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleStatus(cafe, "suspended")}
                              title="Suspend cafe access"
                              className="ghost-button compact-btn"
                            >
                              <XCircle size={14} /> Suspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleStatus(cafe, "active")}
                              title="Restore cafe access"
                              className="primary-button compact-btn"
                            >
                              <CheckCircle2 size={14} /> Restore
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleDelete(cafe)}
                            title="Permanently delete cafe"
                            className="danger-button compact-btn"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
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

      {ownerModal ? (
        <div className="sa-modal-scrim">
          <form className="sa-modal" onSubmit={event => { event.preventDefault(); if (!loading) saveOwnerEmail() }}>
            <h3 style={{ margin: "0 0 0.5rem", color: "var(--brand-ink)" }}>Update Owner Email — {ownerModal.name}</h3>
            <p className="sa-notice" style={{ margin: "0 0 1rem" }}>Set the account email used to manage this cafe.</p>
            <label className="sa-field">
              <span className="sa-label">Owner Email</span>
              <input
                type="email" required maxLength={254} autoComplete="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="sa-input"
              />
            </label>
            <div className="sa-modal-actions">
              <button type="button" onClick={() => setOwnerModal(null)} className="sa-ghost">Cancel</button>
              <button type="submit" disabled={loading} className="primary-button">Save</button>
            </div>
          </form>
        </div>
      ) : null}

      {packageModal ? (
        <div className="sa-modal-scrim">
          <form className="sa-modal" onSubmit={event => { event.preventDefault(); if (!loading) confirmPackageChange() }}>
            <h3 style={{ margin: "0 0 0.5rem", color: "var(--brand-ink)" }}>Change Package — {packageModal.name}</h3>
            <p className="sa-notice" style={{ margin: "0 0 1rem" }}>
              Assign a new package to this cafe. Their navigation, routes and backend permissions update immediately via realtime.
            </p>
            <label className="sa-field">
              <span className="sa-label">Package</span>
              <select
                required value={selectedPlanKey}
                onChange={(e) => setSelectedPlanKey(e.target.value)}
                className="sa-select"
                disabled={loading}
              >
                <option value="">Select a package...</option>
                {packagesList.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.status === "inactive"}>
                    {p.name || p.id} ({p.price}){p.status === "inactive" ? " — deactivated" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="sa-modal-actions">
              <button type="button" onClick={() => setPackageModal(null)} className="sa-ghost">Cancel</button>
              <button
                type="submit"
                disabled={loading || !selectedPlanKey}
                className="primary-button"
              >
                {loading ? "Saving..." : "Change Package"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
