import { useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../context/authContextValue"
import { supabase } from "../services/supabase"
import { BrandLogo } from "../components/BrandLogo"
import "./login.css"

export function ResetPassword() {
  const { user, loading, logout } = useAuth()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  if (loading) return <main className="auth-page">Checking reset link…</main>
  return <main className="login-page"><form className="auth-card login-form" onSubmit={async (event) => {
    event.preventDefault()
    if (busy) return
    if (password !== confirm) { setError("Passwords do not match."); return }
    setBusy(true); setError("")
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      await logout(); setDone(true)
    } catch { setError("Could not reset your password. Request a new link and try again.") }
    finally { setBusy(false) }
  }}>
    <BrandLogo size="medium" />
    <h1>Reset password</h1>
    {done ? <p role="status">Password updated. <Link to="/login">Sign in</Link></p> : !user ?
      <p>This reset link has expired or is invalid. <Link to="/login">Request a new link</Link></p> : <>
        <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="field">Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </>}
  </form></main>
}
