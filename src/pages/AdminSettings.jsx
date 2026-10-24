import { toUserMessage } from "../services/userMessages"
import { useConfirm } from "../hooks/useConfirm"
import { useEffect, useState } from "react"
import {
  Banknote, Check, Landmark, Loader2, LogOut, Pencil,
  Plus, ShieldCheck, Smartphone, Trash2, X,
} from "lucide-react"
import { LogoutButton } from "../components/LogoutButton"
import { RegionalSettings } from "../components/RegionalSettings"
import { useAuth } from "../context/authContextValue"
import {
  deletePaymentOption,
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
    // Bring the form into view on small screens where it stacks below.
    document.getElementById("payment-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
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
      setSaveSuccess(wasEdit ? "Payment option updated." : "Payment option added.")
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
      setSaveSuccess("Payment option removed.")
      if (form.id === id) resetForm()
    } catch (err) {
      setSaveError(toUserMessage(err, "Could not delete payment option."))
    }
  }

  const activeCount = paymentOptions.filter((o) => o.active).length

  return (
    <div className="admin-stack settings-page">
      {confirmDialog}
      <div className="admin-head settings-head">
        <div>
          <p className="eyebrow">Customer payment</p>
          <h2>Settings</h2>
          <p className="admin-hint">
            Manage checkout payment methods and your account security.
          </p>
        </div>
        {loading ? null : (
          <span className="settings-count" title={`${activeCount} visible to customers`}>
            {activeCount}/{paymentOptions.length} active
          </span>
        )}
      </div>

      <RegionalSettings />
      <div className="settings-grid admin-grid">
        {/* ---------- Configured payment methods ---------- */}
        <section className="settings-panel settings-list-panel" aria-label="Configured payment options">
          <div className="settings-section-head">
            <div>
              <p className="eyebrow">Checkout</p>
              <h3>Payment options</h3>
            </div>
            {!loading ? <span className="settings-count">{paymentOptions.length}</span> : null}
          </div>

          {saveSuccess && !saveError ? <p className="success-note settings-note">{saveSuccess}</p> : null}
          {loadError ? <p className="form-error">{loadError}</p> : null}

          {loading ? (
            <div className="empty-state">
              <Loader2 size={24} className="spin" />
              <p>Loading payment options…</p>
            </div>
          ) : paymentOptions.length === 0 ? (
            <div className="empty-state settings-empty-state">
              <Landmark size={28} style={{ opacity: 0.35 }} />
              <p style={{ margin: 0 }}>No payment options configured yet.</p>
              <span style={{ fontSize: "0.86rem", opacity: 0.7 }}>
                Add one with the form — customers see it at checkout instantly.
              </span>
            </div>
          ) : (
            <ul className="settings-option-list" role="list">
              {paymentOptions.map((option) => (
                <li key={option.id}>
                  <article
                    className={`payment-option-row settings-payment-card${form.id === option.id ? " is-editing" : ""}`}
                  >
                    <div className="settings-payment-main">
                      <span className={`settings-type-icon ${option.active ? "" : "muted"}`} aria-hidden="true">
                        <PaymentTypeIcon type={option.type} />
                      </span>
                      <div className="settings-payment-info">
                        <h3>
                          {option.name || option.type}
                          <span className={`badge ${option.active ? "approved" : "pending"}`}>
                            {option.active ? "active" : "hidden"}
                          </span>
                        </h3>
                        <p>{option.type}{option.accountNumber ? ` · ${option.accountNumber}` : ""}</p>
                        {option.accountHolder ? <p>{option.accountHolder}</p> : null}
                        {option.instructions ? <p className="settings-instructions">{option.instructions}</p> : null}
                      </div>
                    </div>
                    <div className="row-actions settings-row-actions">
                      <button
                        className="settings-edit-button"
                        type="button"
                        onClick={() => (form.id === option.id ? resetForm() : startEdit(option))}
                        aria-label={`${form.id === option.id ? "Cancel editing" : "Edit"} ${option.name || option.type}`}
                        aria-pressed={form.id === option.id}
                      >
                        {form.id === option.id ? (<><X size={14} /> Cancel</>) : (<><Pencil size={14} /> Edit</>)}
                      </button>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => handleDelete(option.id)}
                        aria-label={`Delete ${option.name || option.type}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- Side column ---------- */}
        <div className="settings-side">
          <form
            id="payment-form"
            className="admin-form settings-panel settings-form-panel"
            onSubmit={submit}
          >
            <div className="settings-form-heading">
              <div>
                <p className="eyebrow">{form.id ? "Editing method" : "New method"}</p>
                <h2>{form.id ? form.name || "Edit payment option" : "Add payment option"}</h2>
              </div>
              {form.id ? <span className="settings-editing-badge"><Pencil size={13} /> Editing</span> : null}
            </div>
            <p className="settings-form-context">
              {form.id ? "Update this payment option, then save your changes." : "Add a payment method customers can use at checkout."}
            </p>

            <div className="two-col">
              <label className="field">
                <span>Type</span>
                <input maxLength={80} list="payment-types" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="Bank, Telebirr, Cash" required />
              </label>
              <label className="field">
                <span>Customer-facing name *</span>
                <input maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. CBE Business" required />
              </label>
            </div>
            <label className="field">
              <span>Account / phone number</span>
              <input value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} required={!/cash/i.test(form.type)} maxLength={80} />
              <small className="form-help">Required for bank transfers and mobile wallets; optional for cash.</small>
            </label>
            <label className="field">
              <span>Account holder</span>
              <input value={form.accountHolder} onChange={(event) => setForm({ ...form, accountHolder: event.target.value })} maxLength={120} required={!/cash/i.test(form.type)} />
            </label>
            <label className="field">
              <span>Instructions</span>
              <textarea rows="3" maxLength={500} value={form.instructions || ""} onChange={(event) => setForm({ ...form, instructions: event.target.value })} placeholder="Shown to customers before they transfer" />
            </label>
            <label className="auto-ready-toggle">
              <input type="checkbox" checked={Boolean(form.active)} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              <span>Show to customers</span>
            </label>

            <datalist id="payment-types"><option value="Bank" /><option value="Mobile wallet" /><option value="Cash" /></datalist>
            <div className="settings-form-actions">
              {form.id ? (
                <button className="ghost-button" type="button" onClick={resetForm} disabled={saving}>
                  Cancel
                </button>
              ) : null}
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="spin" /> : form.id ? <Check size={16} /> : <Plus size={16} />}
                {saving ? "Saving…" : form.id ? "Save changes" : "Add option"}
              </button>
            </div>
            {saveError ? <p className="form-error">{saveError}</p> : null}
          </form>

          <ChangePasswordSection />

          <section className="settings-panel settings-session-panel">
            <p className="eyebrow"><LogOut size={13} style={{ verticalAlign: -1 }} /> Session</p>
            <h2>Account access</h2>
            <p className="admin-hint">Sign out securely from this device when you are finished.</p>
            <LogoutButton />
          </section>
        </div>
      </div>
    </div>
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
    <form className="admin-form settings-panel settings-security-panel" onSubmit={handlePasswordSubmit}>
      <p className="eyebrow"><ShieldCheck size={13} style={{ verticalAlign: -1 }} /> Security</p>
      <h2>Change password</h2>
      <label className="field">
        <span>Current password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Enter current password"
        />
      </label>
      <label className="field">
        <span>New password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 6 chars (1 uppercase, 1 number/symbol)"
        />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter new password"
        />
      </label>
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Updating…" : "Update password"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="success-note" style={{ fontSize: "0.85rem" }}>{success}</p> : null}
    </form>
  )
}
