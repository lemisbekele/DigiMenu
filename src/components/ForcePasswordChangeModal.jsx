import { toUserMessage } from "../services/userMessages"
import { useState } from "react"
import { KeyRound, CheckCircle2, Lock } from "lucide-react"
import { useAuth } from "../context/authContextValue"

export function ForcePasswordChangeModal() {
  const { mustChangePassword, changePassword, logout } = useAuth()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  if (!mustChangePassword) return null

  const validatePassword = (pass) => {
    if (!pass || pass.length < 6) return "Password must be at least 6 characters long."
    if (!/[A-Z]/.test(pass)) return "Password must contain at least one uppercase letter."
    if (!/[0-9!@#$%^&*]/.test(pass)) return "Password must contain at least one number or special character."
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setError("")

    const validationErr = validatePassword(newPassword)
    if (validationErr) {
      setError(validationErr)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation password do not match.")
      return
    }

    setLoading(true)
    try {
      await changePassword(newPassword)
      setSuccess(true)
    } catch (err) {
      setError(toUserMessage(err, "Could not update password. Please verify your current temporary password."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
      <section className="password-change-panel">
        <KeyRound size={28} style={{ color: "var(--brand)" }} />
        <h2 id="password-change-title">Set your permanent password</h2>
        <p className="form-help">Replace your temporary password before accessing the workspace. Use at least 6 characters, one uppercase letter and one number or special character.</p>
        {success ? <p role="status"><CheckCircle2 size={20} /> Password updated.</p> : (
          <form onSubmit={handleSubmit}>
            {error && <p className="form-error" role="alert">{error}</p>}
            <label className="field"><span>New password *</span><input type="password" autoComplete="new-password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={loading} autoFocus /></label>
            <label className="field"><span>Confirm new password *</span><input type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={loading} /></label>
            <div className="form-actions"><button className="ghost-button" type="button" onClick={logout} disabled={loading}>Sign out</button><button className="primary-button" type="submit" disabled={loading}><Lock size={16} />{loading ? "Updating…" : "Set new password"}</button></div>
          </form>
        )}
      </section>
    </div>
  )
}
