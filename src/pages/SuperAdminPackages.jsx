import { DistributionChart } from "../components/PlatformCharts"
import { isSubscriptionActive } from "../services/planService"
import { toUserMessage } from "../services/userMessages"
import { useEffect, useMemo, useState } from "react"
import {
  observePackages,
  observeFeatures,
  savePackage,
  createPackage,
  setPackageStatus,
} from "../services/packageService"
import { observeSubscriptionRequests, assignPackageToCafe } from "../services/subscriptionService"
import { fetchRegisteredCafes } from "../services/cafeService"
import "./superadmin.css"

const EMPTY_PACKAGE = {
  id: "",
  name: "",
  price: "",
  period: "/month",
  description: "",
  features: [],
  status: "active",
  limits: { menuItems: 50, staffUsers: 1 },
}

export function SuperAdminPackages() {
  const [packagesList, setPackagesList] = useState([])
  const [featuresCatalog, setFeaturesCatalog] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [cafes, setCafes] = useState([])
  const [loading, setLoading] = useState(true)

  const [editingPackage, setEditingPackage] = useState(null)
  const [creating, setCreating] = useState(false)
  const [assigningPackage, setAssigningPackage] = useState(null)
  const [selectedCafe, setSelectedCafe] = useState("")
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const showLoadError = () => setNotice({ type: "error", text: "Package administration could not load. Refresh and try again." })

  useEffect(() => {
    return observePackages((data) => setPackagesList(data || []), showLoadError)
  }, [])

  // The feature catalog comes from Supabase (features table) — the same
  // catalog that seeds package entitlements and the #packages display.
  useEffect(() => {
    return observeFeatures((data) => setFeaturesCatalog(data || []), showLoadError)
  }, [])

  useEffect(() => {
    return observeSubscriptionRequests((data) => setSubscriptions(data || []), null, showLoadError)
  }, [])

  useEffect(() => {
    let active = true
    fetchRegisteredCafes().then((data) => {
      if (!active) return
      setCafes(data || [])
      setLoading(false)
    }).catch(() => { if (active) { showLoadError(); setLoading(false) } })
    return () => { active = false }
  }, [])

  const activeCafeCounts = useMemo(() => {
    const counts = {}
    subscriptions.forEach((sub) => {
      if (isSubscriptionActive(sub)) {
        const key = sub.plan_key
        counts[key] = (counts[key] || 0) + 1
      }
    })
    return counts
  }, [subscriptions])

  const cafeNamesBySlug = useMemo(() => {
    const map = {}
    cafes.forEach((c) => {
      map[(c.slug || "").toLowerCase()] = c.name || c.slug
    })
    return map
  }, [cafes])

  const displayList = useMemo(
    () => packagesList.map((pkg) => ({ ...pkg, activeCafes: activeCafeCounts[pkg.id] || 0 })),
    [packagesList, activeCafeCounts],
  )

  const tierAccent = () => "var(--brand)"

  // The exact features stored in Supabase. No hardcoded fallback lists.
  const featureKeysOf = (pkg) => (Array.isArray(pkg?.features) ? pkg.features : [])

  const catalogFeatures = useMemo(
    () => featuresCatalog.filter((feature) => feature.enabled),
    [featuresCatalog],
  )
  const catalogFeatureMap = useMemo(
    () => new Map(catalogFeatures.map((feature) => [feature.key, feature])),
    [catalogFeatures],
  )

  const toggleFeature = (key) => {
    setEditingPackage((prev) => {
      const current = featureKeysOf(prev)
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
      return { ...prev, features: next }
    })
  }

  const validatePackageForm = (pkg) => {
    const features = featureKeysOf(pkg)
    const staffLimit = Number(pkg.limits?.staffUsers || 0)
    if (staffLimit > 0 && !features.includes("staffAccess")) {
      throw new Error("Packages that allow staff accounts must include the Staff Access (staffAccess) feature.")
    }
    if (staffLimit > 1 && !features.includes("userManagement")) {
      throw new Error("Packages that allocate multiple staff accounts must include User Management (userManagement) so the cafe admin can invite staff.")
    }
    if (!features.includes("digitalMenu") || !features.includes("ordering")) {
      throw new Error("Packages must include Digital Menu (digitalMenu) and Online Ordering (ordering) for cafe customer operations.")
    }
  }

  const saveEdit = async () => {
    if (!editingPackage || busy) return
    setBusy(true)
    setNotice(null)
    try {
      if (!editingPackage.id || !editingPackage.id.trim()) throw new Error("A package key is required (e.g. premium).")
      if (!editingPackage.name || !editingPackage.name.trim()) throw new Error("A package name is required.")
      validatePackageForm(editingPackage)
      await savePackage({
        id: editingPackage.id.trim().toLowerCase(),
        name: editingPackage.name,
        price: editingPackage.price,
        period: editingPackage.period,
        description: editingPackage.description,
        features: featureKeysOf(editingPackage),
        status: editingPackage.status,
        limits: editingPackage.limits,
      })
      setNotice({ type: "success", text: `Package "${editingPackage.name}" saved. Feature changes propagate to every assigned cafe in real time.` })
      setEditingPackage(null)
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not save package changes.") })
    } finally {
      setBusy(false)
    }
  }

  const confirmCreate = async () => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      if (!creating.id || !creating.id.trim()) throw new Error("A package key is required (e.g. premium).")
      if (!creating.name || !creating.name.trim()) throw new Error("A package name is required.")
      validatePackageForm(creating)
      await createPackage({
        id: creating.id.trim().toLowerCase(),
        name: creating.name,
        price: creating.price,
        period: creating.period,
        description: creating.description,
        features: featureKeysOf(creating),
        status: "active",
        limits: creating.limits,
      })
      setNotice({ type: "success", text: `Package "${creating.name}" created and is now active.` })
      setCreating(null)
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not create package.") })
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = async (pkg) => {
    setBusy(true)
    setNotice(null)
    try {
      const nextStatus = pkg.status === "active" ? "inactive" : "active"
      await setPackageStatus(pkg.id, nextStatus)
      setNotice({
        type: "success",
        text: `Package "${pkg.name}" is now ${nextStatus}. ${nextStatus === "inactive" ? "Cafes assigned to it lose these features immediately." : ""}`,
      })
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not change package status.") })
    } finally {
      setBusy(false)
    }
  }

  const confirmAssign = async () => {
    if (!assigningPackage || !selectedCafe) return
    setBusy(true)
    setNotice(null)
    try {
      const record = await assignPackageToCafe({ cafeSlug: selectedCafe, planKey: assigningPackage.id })
      setNotice({ type: "success", text: `${assigningPackage.name} assigned to "${record.customer_name}" (${record.cafe_slug}). Their cafe now receives these features in real time.` })
      setAssigningPackage(null)
      setSelectedCafe("")
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not assign package.") })
    } finally {
      setBusy(false)
    }
  }

  const renderFeatureCheckboxes = (pkg, onChange) => (
    <div className="sa-feature-grid">
      {catalogFeatures.map((info) => {
        const checked = featureKeysOf(pkg).includes(info.key)
        return (
          <label key={info.key} className="sa-feature-option">
            <input type="checkbox" checked={checked} onChange={() => onChange(info.key)} />
            <span>
              <strong>{info.name}</strong>
              <span className="sa-feature-desc">{info.description}</span>
            </span>
          </label>
        )
      })}
    </div>
  )

  return (
    <div className="sa-page">
      <div className="sa-head">
        <h1>SaaS Package Management</h1>
        <p>
          Define packages, their feature entitlements and limits. Changes take effect instantly for every assigned cafe — no browser refresh required.
        </p>
      </div>

      {notice && (
        <div className={`sa-alert ${notice.type === "success" ? "sa-alert-success" : "sa-alert-error"}`} style={{ marginBottom: "1.25rem" }}>
          {notice.text}
        </div>
      )}

      <div style={{ marginBottom: "1.25rem" }}>
        <button type="button" onClick={() => setCreating({ ...EMPTY_PACKAGE })} className="sa-btn sa-btn-primary">
          + New Package
        </button>
      </div>

      {!loading && !notice?.type?.includes("error") && <DistributionChart title="Package adoption" description="Current active or approved subscriptions, excluding expired access" items={displayList.map(pkg => ({ key: pkg.id, label: pkg.name, value: pkg.activeCafes }))} />}

      <div className="sa-grid-3">
        {displayList.map((pkg) => {
          const isActive = pkg.status !== "inactive"
          return (
            <div
              key={pkg.id}
              className="sa-fact-card"
              style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", borderTop: `3px solid ${tierAccent(pkg.id)}`, opacity: isActive ? 1 : 0.6 }}
            >
              <div>
                <div className="sa-row" style={{ marginBottom: "1rem" }}>
                  <span style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 800, letterSpacing: 1, color: tierAccent(pkg.id) }}>
                    {pkg.id} TIER
                  </span>
                  <span className={isActive ? "sa-badge sa-badge-success" : "sa-badge"}>{isActive ? `${pkg.activeCafes} Active Cafes` : "Deactivated"}</span>
                </div>
                <h2 style={{ fontSize: "1.4rem", margin: "0 0 4px" }}>{pkg.name}</h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "8px 0 16px" }}>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: tierAccent(pkg.id) }}>{pkg.price}</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-3)" }}>{pkg.period}</span>
                </div>
                <p style={{ fontSize: "0.88rem", color: "var(--text-3)", marginBottom: "1.25rem" }}>{pkg.description}</p>
                <div style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: "0.75rem" }}>
                  <strong style={{ color: "var(--text)" }}>{featureKeysOf(pkg).length}</strong> enabled features
                  {" · "}menu items: <strong style={{ color: "var(--text)" }}>{pkg.limits?.menuItems ?? "—"}</strong>
                  {" · "}staff accounts: <strong style={{ color: "var(--text)" }}>{pkg.limits?.staffUsers ?? "—"}</strong>
                </div>
                <ul style={{ paddingLeft: 18, margin: "0 0 1rem", color: "var(--text-3)", fontSize: "0.82rem", display: "flex", flexDirection: "column", gap: 4 }}>
                  {featureKeysOf(pkg).filter((key) => catalogFeatureMap.has(key)).map((key) => (
                    <li key={key}>{catalogFeatureMap.get(key).name}</li>
                  ))}
                </ul>
                {pkg.activeCafes > 0 && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-3)", marginBottom: "0.75rem", background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px" }}>
                    {subscriptions
                      .filter((s) => isSubscriptionActive(s) && s.plan_key === pkg.id)
                      .map((s) => cafeNamesBySlug[(s.cafe_slug || "").toLowerCase()] || s.cafe_slug || s.customer_name)
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, paddingTop: "1rem", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setEditingPackage({
                    ...pkg,
                    features: featureKeysOf(pkg),
                    limits: { menuItems: pkg.limits?.menuItems ?? 50, staffUsers: pkg.limits?.staffUsers ?? 1 },
                  })}
                  className="sa-btn"
                  style={{ flex: "1 1 120px", justifyContent: "center" }}
                >
                  Edit Package
                </button>
                <button type="button" onClick={() => { setAssigningPackage(pkg); setSelectedCafe("") }} className="sa-btn sa-btn-primary" style={{ flex: "1 1 120px", justifyContent: "center" }}>
                  Assign Cafe
                </button>
                <button type="button" onClick={() => toggleStatus(pkg)} disabled={busy} className="sa-btn" style={{ flex: "1 1 120px", justifyContent: "center" }}>
                  {isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="sa-notice" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
        Package features are the single source of truth for entitlements: cafe routes, navigation, and backend writes all reject features your package does not include. Active cafe counts are computed live from Active subscriptions.
      </p>

      {editingPackage && (
        <div className="sa-modal-scrim">
          <form className="sa-modal sa-modal-wide" onSubmit={event => { event.preventDefault(); if (!busy) saveEdit() }}>
            <h3>Edit Package: {editingPackage.name}</h3>
            <p className="form-help">Provide a clear public name, pricing terms, usage limits and the exact included features.</p>
            {notice?.type === "error" && <p className="sa-form-error" role="alert">{notice.text}</p>}
            <div className="form-grid">
              <label className="sa-field">
                <span className="sa-label">Package Key (read-only)</span>
                <input value={editingPackage.id} readOnly className="sa-input" style={{ background: "var(--surface-2)" }} />
              </label>
              <label className="sa-field">
                <span className="sa-label">Package Name</span>
                <input required maxLength={120} value={editingPackage.name} onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })} className="sa-input" />
              </label>
              <label className="sa-field">
                <span className="sa-label">Published price (include currency code)</span>
                <input type="text" maxLength={80} placeholder="USD 29 (blank for price on request)" value={editingPackage.price} onChange={(e) => setEditingPackage({ ...editingPackage, price: e.target.value })} className="sa-input" />
              </label>
              <label className="sa-field">
                <span className="sa-label">Billing Period Label</span>
                <input type="text" required={Boolean(editingPackage.price?.trim())} maxLength={40} placeholder="/month" value={editingPackage.period} onChange={(e) => setEditingPackage({ ...editingPackage, period: e.target.value })} className="sa-input" />
              </label>
            </div>
            <label className="sa-field">
              <span className="sa-label">Tier Description</span>
              <input type="text" required maxLength={500} value={editingPackage.description} onChange={(e) => setEditingPackage({ ...editingPackage, description: e.target.value })} className="sa-input" />
            </label>
            <div className="form-grid">
              <label className="sa-field">
                <span className="sa-label">Menu Items Limit</span>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={editingPackage.limits?.menuItems ?? ""}
                  onChange={(e) => setEditingPackage({ ...editingPackage, limits: { ...(editingPackage.limits || {}), menuItems: Number(e.target.value) } })}
                  className="sa-input"
                />
              </label>
              <label className="sa-field">
                <span className="sa-label">Staff Accounts Limit</span>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={editingPackage.limits?.staffUsers ?? ""}
                  onChange={(e) => setEditingPackage({ ...editingPackage, limits: { ...(editingPackage.limits || {}), staffUsers: Number(e.target.value) } })}
                  className="sa-input"
                />
              </label>
            </div>
            <fieldset className="sa-field feature-fieldset">
              <legend className="sa-label">Feature Entitlements (single source of truth)</legend>
              {renderFeatureCheckboxes(editingPackage, toggleFeature)}
            </fieldset>
            <div className="sa-modal-actions">
              <p className="muted">Changes apply to every cafe assigned this package ({activeCafeCounts[editingPackage.id] || 0} active subscriptions). To change only one cafe, assign it a different package.</p>
              <button type="button" onClick={() => setEditingPackage(null)} className="sa-ghost">Cancel</button>
              <button type="submit" disabled={busy} className="sa-btn sa-btn-primary">
                {busy ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {creating && (
        <div className="sa-modal-scrim">
          <form className="sa-modal sa-modal-wide" onSubmit={event => { event.preventDefault(); if (!busy) confirmCreate() }}>
            <h3>Create New Package</h3>
            <p className="form-help">Provide a clear public name, pricing terms, usage limits and the exact included features.</p>
            {notice?.type === "error" && <p className="sa-form-error" role="alert">{notice.text}</p>}
            <div className="form-grid">
              <label className="sa-field">
                <span className="sa-label">Package Key (unique id, e.g. premium)</span>
                <input required maxLength={64} pattern="[a-z0-9](?:[a-z0-9_]|-)*" title="Use lowercase letters, numbers, hyphens or underscores." value={creating.id} onChange={(e) => setCreating({ ...creating, id: e.target.value })} className="sa-input" />
              </label>
              <label className="sa-field">
                <span className="sa-label">Package Name</span>
                <input required maxLength={120} value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} className="sa-input" />
              </label>
              <label className="sa-field">
                <span className="sa-label">Published price (include currency code)</span>
                <input type="text" maxLength={80} placeholder="USD 29 (blank for price on request)" value={creating.price} onChange={(e) => setCreating({ ...creating, price: e.target.value })} className="sa-input" />
              </label>
              <label className="sa-field">
                <span className="sa-label">Billing Period Label</span>
                <input type="text" required={Boolean(creating.price?.trim())} maxLength={40} placeholder="/month" value={creating.period} onChange={(e) => setCreating({ ...creating, period: e.target.value })} className="sa-input" />
              </label>
            </div>
            <label className="sa-field">
              <span className="sa-label">Tier Description</span>
              <input type="text" required maxLength={500} value={creating.description} onChange={(e) => setCreating({ ...creating, description: e.target.value })} className="sa-input" />
            </label>
            <div className="form-grid">
              <label className="sa-field">
                <span className="sa-label">Menu Items Limit</span>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={creating.limits?.menuItems ?? ""}
                  onChange={(e) => setCreating({ ...creating, limits: { ...(creating.limits || {}), menuItems: Number(e.target.value) } })}
                  className="sa-input"
                />
              </label>
              <label className="sa-field">
                <span className="sa-label">Staff Accounts Limit</span>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={creating.limits?.staffUsers ?? ""}
                  onChange={(e) => setCreating({ ...creating, limits: { ...(creating.limits || {}), staffUsers: Number(e.target.value) } })}
                  className="sa-input"
                />
              </label>
            </div>
            <fieldset className="sa-field feature-fieldset">
              <legend className="sa-label">Feature Entitlements</legend>
              {renderFeatureCheckboxes(creating, (key) =>
                setCreating((prev) => {
                  const current = featureKeysOf(prev)
                  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
                  return { ...prev, features: next }
                }),
              )}
            </fieldset>
            <div className="sa-modal-actions">
              <button type="button" onClick={() => setCreating(null)} className="sa-ghost">Cancel</button>
              <button type="submit" disabled={busy} className="sa-btn sa-btn-primary">
                {busy ? "Creating..." : "Create Package"}
              </button>
            </div>
          </form>
        </div>
      )}

      {assigningPackage && (
        <div className="sa-modal-scrim">
          <form className="sa-modal" onSubmit={event => { event.preventDefault(); if (!busy) confirmAssign() }}>
            <h3>Assign {assigningPackage.name} to Cafe</h3>
            <p className="sa-notice" style={{ margin: "0 0 1rem" }}>
              Creates or updates an Active subscription for the selected registered cafe. The cafe receives these features immediately.
            </p>
            {notice?.type === "error" && <p className="sa-form-error" role="alert">{notice.text}</p>}
            <label className="sa-field">
              <span className="sa-label">Registered Cafe</span>
              <select
                required value={selectedCafe}
                onChange={(e) => setSelectedCafe(e.target.value)}
                className="sa-select"
                disabled={loading}
              >
                <option value="">{loading ? "Loading cafes..." : "Select a cafe..."}</option>
                {cafes.map((cafe) => (
                  <option key={cafe.id || cafe.slug} value={cafe.slug}>
                    {cafe.name || cafe.slug} ({cafe.slug}) {cafe.owner_email ? `· ${cafe.owner_email}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="sa-modal-actions">
              <button type="button" onClick={() => setAssigningPackage(null)} className="sa-ghost">Cancel</button>
              <button
                type="submit"
                disabled={busy || !selectedCafe}
                className="sa-btn sa-btn-primary"
              >
                {busy ? "Assigning..." : "Confirm Assignment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
