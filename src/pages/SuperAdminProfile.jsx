import { ShieldCheck } from "lucide-react"
import { VisualSummary } from "../components/PlatformCharts"
import { toUserMessage } from "../services/userMessages"
import { useState } from "react"
import { useAuth } from "../context/authContextValue"
import "./superadmin.css"

export function SuperAdminProfile() {
  const { user, changePassword } = useAuth()
  const [currentPass, setCurrentPass] = useState("")
  const [newPass, setNewPass] = useState("")
  const [confirmPass, setConfirmPass] = useState("")
  const [msg, setMsg] = useState({ type: "", text: "" })
  const [submitting, setSubmitting] = useState(false)

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (submitting) return
    setMsg({ type: "", text: "" })
    if (newPass !== confirmPass) {
      setMsg({ type: "error", text: "New passwords do not match." })
      return
    }
    setSubmitting(true)
    try {
      await changePassword(currentPass, newPass)
      setMsg({ type: "success", text: "Password updated successfully!" })
      setCurrentPass("")
      setNewPass("")
      setConfirmPass("")
    } catch (err) {
      setMsg({ type: "error", text: toUserMessage(err, "Failed to update password.") })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sa-page sa-page-narrow">
      <div className="sa-head">
        <h1>Account &amp; security</h1>
        <p>
          Manage your platform administrator identity and password.
        </p>
      </div>

      <VisualSummary icon={ShieldCheck} title="Platform administrator">Your account manages cafe access and platform configuration. Keep your password unique and private.</VisualSummary>

      <div className="sa-fact-card">
        <h3 className="sa-card-title">Account Information</h3>
        <div className="sa-fact-grid">
          <div>
            <span className="sa-fact-label">Account Email</span>
            <strong className="sa-fact-value" style={{ display: "block", marginTop: 2 }}>{user?.email || "Unavailable"}</strong>
          </div>
          <div>
            <span className="sa-fact-label">Assigned Role</span>
            <span className="sa-fact-success" style={{ display: "block", marginTop: 2 }}>● Platform Superadmin</span>
          </div>
          <div>
            <span className="sa-fact-label">Security Status</span>
            <span className="sa-fact-brand" style={{ display: "block", marginTop: 2 }}>Signed in</span>
          </div>
        </div>
      </div>

      <div className="sa-fact-card">
        <h3 className="sa-card-title">Security &amp; Password Update</h3>

        {msg.text && (
          <div className={`sa-alert ${msg.type === "error" ? "sa-alert-error" : "sa-alert-success"}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="sa-field">
            <span className="sa-label">Current Password</span>
            <input
              type="password"
              autoComplete="current-password" value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              required
              className="sa-input"
            />
          </label>
          <label className="sa-field">
            <span className="sa-label">New Password (minimum 6 characters)</span>
            <input
              type="password"
              autoComplete="new-password" value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              required
              minLength={6}
              className="sa-input"
            />
          </label>
          <label className="sa-field">
            <span className="sa-label">Confirm New Password</span>
            <input
              type="password"
              autoComplete="new-password" value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              required
              minLength={6}
              className="sa-input"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="sa-btn sa-btn-primary"
          >
            {submitting ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  )
}