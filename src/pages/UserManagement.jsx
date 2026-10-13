import { toUserMessage } from "../services/userMessages"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, Shield, CheckCircle, XCircle, Plus, Trash2, AlertTriangle } from "lucide-react"
import { useRBAC } from "../context/rbacContextValue"
import { ROLE_LABELS, ROLES, syncRoleToSupabase, setUserDisabled, PERMISSIONS } from "../services/roleService"
import { createAuthUser, deleteAuthUser, observeCafeUsers } from "../services/dataService"
import { useAuth } from "../context/authContextValue"
import { usePlan } from "../context/planContextValue"

function normalize(v) {
  return String(v || "").toLowerCase().trim()
}

export function UserManagement() {
  const { can } = useRBAC()
  const { cafeSlug } = useAuth()
  const { plan, packages, subscriptionStatus } = usePlan()
  const assignableRoles = Object.entries(ROLE_LABELS).filter(([key]) => key !== ROLES.SUPERADMIN)

  const [users, setUsers] = useState([])
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: "", password: "", role: ROLES.BARISTA, displayName: "" })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [editingUser, setEditingUser] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const activePackage = useMemo(
    () => (packages || []).find((pkg) => pkg?.id === plan) || null,
    [packages, plan],
  )
  const staffLimit = Number(activePackage?.limits?.staffUsers)
  const hasStaffLimit = Number.isInteger(staffLimit) && staffLimit > 0
  const staffSeatsRemaining = hasStaffLimit ? Math.max(staffLimit - users.length, 0) : 0
  const userCreationUnavailable = subscriptionStatus === "loading" || !hasStaffLimit || staffSeatsRemaining < 1
  const userCreationReason = subscriptionStatus === "loading"
    ? "Checking your package allowance…"
    : !hasStaffLimit
      ? "This package has no staff-account allocation. Contact the platform administrator."
      : `All ${staffLimit} staff accounts included in this package are in use.`

  useEffect(() => {
    const unsub = observeCafeUsers(cafeSlug, (docs) => {
      setUsers(
        docs.map((d) => ({
          id: d.id,
          email: d.email || "",
          role: d.role || ROLES.BARISTA,
          displayName: d.displayName || d.email?.split("@")[0] || d.id,
          disabled: d.disabled || false,
        })),
      )
    })
    return unsub
  }, [cafeSlug])

  const assignRole = useCallback(async (uid, email, role) => {
    try {
      await syncRoleToSupabase(uid, email, role)
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, role } : u)))
      setMessage(`Role updated for ${email}`)
      setTimeout(() => setMessage(""), 3000)
    } catch (err) {
      setMessage(toUserMessage(err, "Could not update role."))
    }
  }, [])

  const toggleDisable = useCallback(async (user) => {
    try {
      const nextDisabled = !user.disabled
      await setUserDisabled(user.id, nextDisabled)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, disabled: nextDisabled } : u)))
    } catch (err) {
      setMessage(toUserMessage(err, "Could not toggle user status."))
    }
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteAuthUser(deleteTarget.id)
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id))
      setMessage(`User ${deleteTarget.email} deleted permanently.`)
      setTimeout(() => setMessage(""), 4000)
    } catch (err) {
      setMessage(toUserMessage(err, "Could not delete user."))
    }
    setDeleteTarget(null)
  }, [deleteTarget])

  const createUser = useCallback(async (event) => {
    event.preventDefault()
    if (saving) return
    if (!form.displayName.trim()) {
      setMessage("Enter the staff member’s name.")
      return
    }
    if (userCreationUnavailable) {
      setMessage(userCreationReason)
      return
    }
    setSaving(true)
    setMessage("")
    try {
      const uid = await createAuthUser(form.email, form.password, form.displayName, form.role)
      if (uid) {
        setUsers((prev) => [...prev, { id: uid, email: form.email, role: form.role, displayName: form.displayName || form.email.split("@")[0], disabled: false }])
        setShowForm(false)
        setForm({ email: "", password: "", role: ROLES.BARISTA, displayName: "" })
        setMessage(`User ${form.email} created successfully.`)
      }
      setTimeout(() => setMessage(""), 3000)
    } catch (err) {
      setMessage(toUserMessage(err, "Could not create user."))
    } finally {
      setSaving(false)
    }
  }, [form, saving, userCreationReason, userCreationUnavailable])

  const canManage = can(PERMISSIONS.USER_MANAGE) || can(PERMISSIONS.ROLE_MANAGE)

  if (!canManage) {
    return <div className="empty-state">You do not have permission to manage users.</div>
  }

  const filtered = users.filter((u) => {
    const matchSearch = !normalize(search) || normalize(u.email).includes(normalize(search)) || normalize(u.displayName).includes(normalize(search))
    const matchRole = roleFilter === "all" || u.role === roleFilter
    return matchSearch && matchRole
  })

  return (
    <div className="admin-stack">
      <div className="orders-dashboard-head">
        <div>
          <p className="eyebrow">Access control</p>
          <h2>User Management</h2>
          <p className="admin-hint">{users.length} accounts · {users.filter((u) => !u.disabled).length} active</p>
        </div>
        <button
          className="primary-button user-add-button"
          type="button"
          onClick={() => setShowForm(true)}
          disabled={userCreationUnavailable}
          title={userCreationUnavailable ? userCreationReason : "Add a staff account"}
        >
          <Plus size={18} /> Add User
        </button>
      </div>

      <section className={`staff-seat-summary${userCreationUnavailable ? " is-at-capacity" : ""}`} aria-live="polite">
        <div>
          <p className="eyebrow">{activePackage?.name || "Current package"} allowance</p>
          <h3>Staff accounts</h3>
          <p>{hasStaffLimit ? "Every cafe account, including disabled accounts, uses one staff seat." : userCreationReason}</p>
        </div>
        <div className="staff-seat-usage" aria-label={hasStaffLimit ? `${users.length} of ${staffLimit} staff accounts used` : userCreationReason}>
          <strong>{hasStaffLimit ? `${users.length}/${staffLimit}` : "—"}</strong>
          <span>{hasStaffLimit ? `${staffSeatsRemaining} remaining` : "Allocation unavailable"}</span>
        </div>
      </section>

      {message ? <p className={`${message.includes("successfully") || message.includes("updated") ? "success-note" : "form-error"}`}>{message}</p> : null}

      <div className="orders-toolbar">
        <label className="field">
          <span>Search users</span>
          <div className="input-with-icon">
            <Search size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Email or name..." />
          </div>
        </label>
        <label className="field">
          <span>Role filter</span>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            {assignableRoles.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {showForm ? (
        <form className="admin-form" onSubmit={createUser}>
          <div className="admin-head">
            <h3>Create new user</h3>
            <button className="icon-button" type="button" aria-label="Close new user form" disabled={saving} onClick={() => setShowForm(false)}>✕</button>
          </div>
          {message && <p className="form-error" role="alert">{message}</p>}
          <div className="form-grid">
            <label className="field">
              <span>Email *</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={254} autoComplete="email" placeholder="person@example.com" />
            </label>
            <label className="field">
              <span>Temporary password *</span>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="new-password" />
            </label>
          </div>
          <div className="two-col">
            <label className="field">
              <span>Staff member’s name *</span>
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required maxLength={120} autoComplete="name" placeholder="Full name" />
            </label>
            <label className="field">
              <span>Access role *</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {assignableRoles.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="form-help">Use at least 8 characters for the temporary password. The new staff member must change it at first sign-in. Assign only the access their work requires.</p>
          <button className="primary-button" type="submit" disabled={saving}>
            <Shield size={18} /> {saving ? "Creating..." : "Create User"}
          </button>
        </form>
      ) : null}

      <div className="audit-table-card">
        {filtered.length === 0 ? <div className="empty-state">No users found.</div> : (
          <div className="audit-table">
            <div className="audit-row audit-row-head">
              <span>User</span>
              <span>Role</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {filtered.map((u) => (
              <div className={`audit-row ${u.disabled ? "muted" : ""}`} key={u.id}>
                <div>
                  <strong>{u.displayName}</strong>
                  <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>{u.email}</p>
                </div>
                <span>
                  {editingUser === u.id ? (
                    <select value={u.role} onChange={(e) => { assignRole(u.id, u.email, e.target.value); setEditingUser(null) }} autoFocus>
                      {assignableRoles.map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`badge ${u.role}`}>{ROLE_LABELS[u.role] || u.role}</span>
                  )}
                </span>
                <span>
                  {u.disabled ? <span className="badge rejected">Disabled</span> : <span className="badge approved">Active</span>}
                </span>
                  <div className="row-actions">
                    <button className="ghost-button small" type="button" onClick={() => setEditingUser(editingUser === u.id ? null : u.id)} title="Change role">
                      <Shield size={14} />
                    </button>
                    <button className="ghost-button small danger" type="button" onClick={() => setDeleteTarget(u)} title="Delete user">
                      <Trash2 size={14} />
                    </button>
                    <button className="ghost-button small" type="button" onClick={() => toggleDisable(u)} title={u.disabled ? "Enable" : "Disable"}>
                      {u.disabled ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    </button>
                  </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget ? (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <form className="admin-form admin-edit-modal" onSubmit={(e) => { e.preventDefault(); confirmDelete() }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <AlertTriangle size={40} style={{ color: "var(--danger)" }} />
            </div>
            <h2 style={{ textAlign: "center" }}>Delete user?</h2>
            <p style={{ textAlign: "center", opacity: 0.7 }}>
              This will permanently delete <strong>{deleteTarget.email}</strong> from both auth and the system. This cannot be undone.
            </p>
            <div className="row-actions" style={{ justifyContent: "center", marginTop: 16 }}>
              <button className="danger-button" type="submit">Delete permanently</button>
              <button className="ghost-button" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
