import { toUserMessage } from "../services/userMessages"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, Shield, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react"
import { useRBAC } from "../context/rbacContextValue"
import { ROLE_LABELS, ROLES, syncRoleToSupabase, setUserDisabled, PERMISSIONS } from "../services/roleService"
import { createAuthUser, deleteAuthUser, observeCafeUsers } from "../services/dataService"
import { useAuth } from "../context/authContextValue"
import { usePlan } from "../context/planContextValue"
import { useConfirm } from "../hooks/useConfirm"
import { Modal } from "../components/Modal"
import "./staff.css"

function normalize(v) {
  return String(v || "").toLowerCase().trim()
}

export function UserManagement() {
  const { can } = useRBAC()
  const [confirm, confirmDialog] = useConfirm()
  const { cafeSlug, user: me } = useAuth()
  const { plan, packages, subscriptionStatus } = usePlan()
  const assignableRoles = Object.entries(ROLE_LABELS).filter(([key]) => key !== ROLES.SUPERADMIN)

  const [users, setUsers] = useState([])
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: "", password: "", role: ROLES.BARISTA, displayName: "" })
  const [saving, setSaving] = useState(false)
  // { ok, text }: success and error are told apart by flag, not by guessing from the wording.
  const [message, setMessage] = useState(null)

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
      setMessage({ ok: true, text: `Role updated for ${email}.` })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({ ok: false, text: toUserMessage(err, "Could not update role.") })
    }
  }, [])

  const toggleDisable = useCallback(async (user) => {
    try {
      const nextDisabled = !user.disabled
      await setUserDisabled(user.id, nextDisabled)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, disabled: nextDisabled } : u)))
    } catch (err) {
      setMessage({ ok: false, text: toUserMessage(err, "Could not turn this account on or off.") })
    }
  }, [])

  const removeUser = async (user) => {
    if (!(await confirm(`${user.email} loses access straight away and their account is deleted. This cannot be undone.`, { title: `Delete ${user.displayName}?`, confirmLabel: "Delete permanently" }))) return
    try {
      await deleteAuthUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      setMessage({ ok: true, text: `${user.email} was deleted.` })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ ok: false, text: toUserMessage(err, "Could not delete this person.") })
    }
  }

  const createUser = useCallback(async (event) => {
    event.preventDefault()
    if (saving) return
    if (!form.displayName.trim()) {
      setMessage({ ok: false, text: "Enter the person’s name." })
      return
    }
    if (userCreationUnavailable) {
      setMessage({ ok: false, text: userCreationReason })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const uid = await createAuthUser(form.email, form.password, form.displayName, form.role)
      if (uid) {
        setUsers((prev) => [...prev, { id: uid, email: form.email, role: form.role, displayName: form.displayName || form.email.split("@")[0], disabled: false }])
        setShowForm(false)
        setForm({ email: "", password: "", role: ROLES.BARISTA, displayName: "" })
        setMessage({ ok: true, text: `${form.email} was added.` })
      }
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({ ok: false, text: toUserMessage(err, "Could not add this person.") })
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

  const seatPercent = hasStaffLimit ? Math.min(100, Math.round((users.length / staffLimit) * 100)) : 0

  return (
    <div className="oc-page">
      {confirmDialog}
      <header className="oc-head">
        <div>
          <h1>Team</h1>
          <p>{users.length} people · {users.filter((u) => !u.disabled).length} active</p>
        </div>
        <button
          className="oc-head-action"
          type="button"
          onClick={() => { setMessage(null); setShowForm(true) }}
          disabled={userCreationUnavailable}
          title={userCreationUnavailable ? userCreationReason : "Add a staff account"}
        >
          <Plus size={18} /> Add person
        </button>
      </header>

      <section className={`ad-seats${userCreationUnavailable ? " is-full" : ""}`} aria-live="polite">
        <p><strong>{hasStaffLimit ? `${users.length} of ${staffLimit}` : "—"}</strong> staff accounts used{activePackage?.name ? ` on ${activePackage.name}` : ""}</p>
        {hasStaffLimit ? <div className="ad-seats-bar" aria-hidden="true"><span style={{ width: `${seatPercent}%` }} /></div> : null}
        <p>{hasStaffLimit ? (staffSeatsRemaining ? `${staffSeatsRemaining} left` : userCreationReason) : userCreationReason}</p>
      </section>

      {message && !showForm ? <p className={message.ok ? "ad-success" : "form-error"} role={message.ok ? "status" : "alert"}>{message.text}</p> : null}

      <section className="oc-toolbar">
        <label className="oc-search">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" aria-label="Search people" />
        </label>
        <div className="oc-chips" role="group" aria-label="Role">
          <button type="button" className="oc-chip" aria-pressed={roleFilter === "all"} onClick={() => setRoleFilter("all")}>Everyone</button>
          {assignableRoles.map(([key, label]) => (
            <button key={key} type="button" className="oc-chip" aria-pressed={roleFilter === key} onClick={() => setRoleFilter(key)}>{label}</button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="oc-empty">
          <Search size={32} strokeWidth={1.5} />
          <strong>No one found</strong>
          <p>Try another name or role.</p>
        </div>
      ) : (
        <div className="ad-list">
          {filtered.map((u) => (
            <article className={`ad-row${u.disabled ? " is-muted" : ""}`} key={u.id}>
              <div className="ad-row-main">
                <h3 className="ad-row-title">{u.displayName}{u.disabled ? <span className="badge rejected" style={{ marginLeft: 8 }}>Turned off</span> : null}</h3>
                <p className="ad-row-sub">{u.email}</p>
              </div>
              <div className="ad-row-actions">
                <select className="ad-select" value={u.role} onChange={(e) => assignRole(u.id, u.email, e.target.value)} aria-label={`Role for ${u.displayName}`}>
                  {assignableRoles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                {u.id === me?.id ? (
                  <span className="ad-row-sub">You</span>
                ) : (
                  <>
                    <button className="oc-quiet" type="button" onClick={() => toggleDisable(u)}>
                      {u.disabled ? <><CheckCircle size={16} /> Turn on</> : <><XCircle size={16} /> Turn off</>}
                    </button>
                    <button className="ad-icon oc-danger" type="button" onClick={() => removeUser(u)} aria-label={`Delete ${u.displayName}`} title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {showForm ? (
        <Modal title="Add a person" className="confirm-dialog" busy={saving} onClose={() => setShowForm(false)}>
          <form className="ad-form" onSubmit={createUser}>
            <label className="ad-field">
              Name
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required maxLength={120} autoComplete="name" placeholder="Full name" />
            </label>
            <label className="ad-field">
              Email
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={254} autoComplete="email" placeholder="person@example.com" />
            </label>
            <label className="ad-field">
              Temporary password
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="new-password" />
              <small>At least 8 characters. They change it the first time they sign in.</small>
            </label>
            <label className="ad-field">
              Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {assignableRoles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <small>Give only the access their work needs.</small>
            </label>
            {message && !message.ok ? <p className="form-error" role="alert">{message.text}</p> : null}
            <div className="row-actions">
              <button className="primary-button" type="submit" disabled={saving}><Shield size={18} /> {saving ? "Adding…" : "Add person"}</button>
              <button className="ghost-button" type="button" disabled={saving} onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
