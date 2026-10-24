import { toUserMessage } from "../services/userMessages"
import { useConfirm } from "../hooks/useConfirm"
import { useEffect, useState } from "react"
import {
  Banknote, Check, Landmark, Loader2, Pencil,
  Plus, Smartphone, Trash2,
} from "lucide-react"
import { LogoutButton } from "../components/LogoutButton"
import { Modal } from "../components/Modal"
import { DEFAULT_KITCHEN_CAPACITY } from "../services/kitchenQueue"
import "./staff.css"
import { RegionalSettings } from "../components/RegionalSettings"
import { useAuth } from "../context/authContextValue"
import {
  deletePaymentOption,
  fetchKitchenCapacity,
  saveKitchenCapacity,
  observePaymentOptions,
  savePaymentOption,
} from "../services/dataService"

const blankPayment = {
  type: "Bank",
  name: "",
  accountNumber: "",
  accountHolder: "",
  instructions: "",
  active: true,
}

function PaymentTypeIcon({ type }) {
  const t = String(type || "").toLowerCase()
  if (t.includes("cash")) return <Banknote size={18} />
  if (t.includes("telebirr") || t.includes("m-pesa") || t.includes("mpesa") || t.includes("mobile")) {
    return <Smartphone size={18} />
  }
  return <Landmark size={18} />
}

export function AdminSettings() {
  const [confirm, confirmDialog] = useConfirm()
  const [paymentOptions, setPaymentOptions] = useState([])
  const [form, setForm] = useState(blankPayment)
  const [loadError, setLoadError] = useState("")
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    return observePaymentOptions((data) => {
      setPaymentOptions(data)
      setLoading(false)
    }, true, (err) => {
      setLoadError(err)
      setLoading(false)
    })
  }, [])

  const startEdit = (option) => {
    setForm(option)
    setSaveError("")
    setSaveSuccess("")
    setFormOpen(true)
  }

  const resetForm = () => {
    setForm(blankPayment)
    setSaveError("")
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setSaveError("")
    setSaveSuccess("")
    const wasEdit = Boolean(form.id)
    try {
      await savePaymentOption(form)
      setForm(blankPayment)
      setFormOpen(false)
      setSaveSuccess(wasEdit ? "Payment method updated." : "Payment method added.")
    } catch (error) {
      setSaveError(toUserMessage(error, "Payment option could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!(await confirm("Customers will no longer see it at checkout.", { title: "Remove payment option?", confirmLabel: "Remove" }))) return
    try {
      await deletePaymentOption(id)
      setSaveSuccess("Payment method removed.")
      if (form.id === id) resetForm()
    } catch (err) {
      setSaveError(toUserMessage(err, "Could not delete payment option."))
    }
  }

  const activeCount = paymentOptions.filter((o) => o.active).length

  return (
    <div className="oc-page">
      {confirmDialog}
      <header className="oc-head">
        <div>
          <h1>Settings</h1>
          <p>Region, payments, kitchen and your account.</p>
        </div>
      </header>

      <div className="ad-stack">
        <RegionalSettings />

        <section className="ad-section" aria-labelledby="payments-heading">
          <div className="ad-section-head">
            <div>
              <h2 id="payments-heading">Payment methods</h2>
              <p>{loading ? "Loading…" : `${activeCount} of ${paymentOptions.length} shown to customers at checkout.`}</p>
            </div>
            <button className="oc-head-action" type="button" onClick={() => { resetForm(); setSaveSuccess(""); setFormOpen(true) }}>
              <Plus size={18} /> Add method
            </button>
          </div>
          {saveSuccess && !saveError ? <p className="ad-success" role="status">{saveSuccess}</p> : null}
          {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
          {saveError && !formOpen ? <p className="form-error" role="alert">{saveError}</p> : null}
          {loading ? (
            <p className="ad-row-sub"><Loader2 size={16} className="spin" /> Loading payment methods…</p>
          ) : paymentOptions.length === 0 ? (
            <div className="oc-empty">
              <Landmark size={28} strokeWidth={1.5} />
              <strong>No payment methods yet</strong>
              <p>Customers can still pay cash. Add a bank or mobile wallet to accept transfers.</p>
            </div>
          ) : (
            <div className="ad-list">
              {paymentOptions.map((option) => (
                <article key={option.id} className={`ad-row${option.active ? "" : " is-muted"}`}>
                  <span className="ad-thumb" style={{ display: "grid", placeItems: "center", width: 44, height: 44 }} aria-hidden="true">
                    <PaymentTypeIcon type={option.type} />
                  </span>
                  <div className="ad-row-main">
                    <h3 className="ad-row-title">
                      {option.name || option.type}
                      {option.active ? null : <span className="badge pending" style={{ marginLeft: 8 }}>Hidden</span>}
                    </h3>
                    <p className="ad-row-sub">
                      {option.type}{option.accountNumber ? ` · ${option.accountNumber}` : ""}{option.accountHolder ? ` · ${option.accountHolder}` : ""}
                    </p>
                  </div>
                  <div className="ad-row-actions">
                    <button className="ad-icon" type="button" onClick={() => startEdit(option)} aria-label={`Edit ${option.name || option.type}`} title="Edit">
                      <Pencil size={18} />
                    </button>
                    <button className="ad-icon oc-danger" type="button" onClick={() => handleDelete(option.id)} aria-label={`Delete ${option.name || option.type}`} title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <KitchenQueueSection />

        <section className="ad-section" aria-labelledby="account-heading">
          <div className="ad-section-head">
            <div>
              <h2 id="account-heading">Your account</h2>
              <p>Change your password or sign out of this device.</p>
            </div>
            <LogoutButton />
          </div>
          <ChangePasswordSection />
        </section>
      </div>

      {formOpen ? (
        <Modal title={form.id ? `Edit ${form.name || "payment method"}` : "Add a payment method"} busy={saving} onClose={() => { setFormOpen(false); resetForm() }}>
          <form className="ad-form" onSubmit={submit}>
            <div className="ad-fields">
              <label className="ad-field">
                Type
                <input maxLength={80} list="payment-types" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="Bank, Telebirr, Cash" required />
              </label>
              <label className="ad-field">
                Name customers see
                <input maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. CBE Business" required />
              </label>
            </div>
            <label className="ad-field">
              Account or phone number
              <input value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} required={!/cash/i.test(form.type)} maxLength={80} />
              <small>Needed for bank transfers and mobile wallets.</small>
            </label>
            <label className="ad-field">
              Account holder
              <input value={form.accountHolder} onChange={(event) => setForm({ ...form, accountHolder: event.target.value })} maxLength={120} required={!/cash/i.test(form.type)} />
            </label>
            <label className="ad-field">
              Instructions for customers
              <textarea rows="3" maxLength={500} value={form.instructions || ""} onChange={(event) => setForm({ ...form, instructions: event.target.value })} placeholder="Shown before they transfer" />
            </label>
            <label className="ad-switch">
              <input type="checkbox" checked={Boolean(form.active)} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              <span aria-hidden="true" />
              Show at checkout
            </label>
            <datalist id="payment-types"><option value="Bank" /><option value="Mobile wallet" /><option value="Cash" /></datalist>
            {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
            <div className="row-actions">
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="spin" /> : form.id ? <Check size={16} /> : <Plus size={16} />}
                {saving ? "Saving…" : form.id ? "Save changes" : "Add method"}
              </button>
              <button className="ghost-button" type="button" onClick={() => { setFormOpen(false); resetForm() }} disabled={saving}>Cancel</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

// Same per-cafe setting as the kitchen settings page, so owners can find it here too.
function KitchenQueueSection() {
  const [capacity, setCapacity] = useState(DEFAULT_KITCHEN_CAPACITY)
  const [note, setNote] = useState(null)
  useEffect(() => { fetchKitchenCapacity().then(setCapacity).catch(() => {}) }, [])
  const change = async (value) => {
    setCapacity(value)
    try {
      await saveKitchenCapacity(value)
      setNote({ ok: true, text: "Saved." })
    } catch (err) {
      setNote({ ok: false, text: toUserMessage(err, "Could not save this setting.") })
    }
  }
  return (
    <section className="ad-section" aria-labelledby="kitchen-heading">
      <div className="ad-section-head">
        <div>
          <h2 id="kitchen-heading">Kitchen</h2>
          <p>How many orders the kitchen makes at once. The oldest this many show as Preparing; customers' wait times use it.</p>
        </div>
        <select className="ad-select" value={capacity} onChange={(e) => change(Number(e.target.value))} aria-label="Orders in progress at once">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} at once</option>)}
        </select>
      </div>
      {note ? <p className={note.ok ? "ad-success" : "form-error"} role={note.ok ? "status" : "alert"}>{note.text}</p> : null}
    </section>
  )
}

function ChangePasswordSection() {
  const { changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!currentPassword) {
      setError("Current password is required.")
      return
    }
    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters.")
      return
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("New password must contain at least one uppercase letter.")
      return
    }
    if (!/[0-9!@#$%^&*]/.test(newPassword)) {
      setError("New password must contain at least one number or special character.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.")
      return
    }

    setLoading(true)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccess("Password updated successfully.")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setError(toUserMessage(err, "Failed to update password."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="ad-form" onSubmit={handlePasswordSubmit} aria-label="Change password">
      <div className="ad-fields">
        <label className="ad-field">
          Current password
          <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label className="ad-field">
          New password
          <input type="password" required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <small>6+ characters, 1 capital, 1 number or symbol.</small>
        </label>
        <label className="ad-field">
          Repeat new password
          <input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="ad-success" role="status">{success}</p> : null}
      <div>
        <button className="oc-quiet" type="submit" disabled={loading}>{loading ? "Updating…" : "Change password"}</button>
      </div>
    </form>
  )
}
