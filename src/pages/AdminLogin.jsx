import { toUserMessage } from "../services/userMessages"
import { useRef, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, LoaderCircle } from "lucide-react"
import { useAuth } from "../context/authContextValue"
import { getRoleRoute, ROLES } from "../services/roleService"
import { BrandLogo } from "../components/BrandLogo"
import { supabase } from "../services/supabase"
import "./login.css"

export function AdminLogin() {
  const { user, loading, roleLoading, role, cafeSlug: authCafeSlug, login, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { cafeSlug: routeCafeSlug } = useParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [resetting, setResetting] = useState(false)
  const emailRef = useRef(null)

  if (loading || roleLoading) return <main className="login-page"><div className="login-wrap"><BrandLogo size="large" /><section className="auth-card login-form login-check" role="status"><LoaderCircle className="login-spinner" size={24} /><p>Checking session...</p></section></div></main>

  // All tabs share the browser session. Never silently treat a remembered
  // account as the credentials the visitor intends to enter on this page.
  if (user) {
    const target = role === ROLES.SUPERADMIN
      ? getRoleRoute(role)
      : role && authCafeSlug ? getRoleRoute(role, authCafeSlug) : null
    return <main className="login-page"><section className="auth-card login-form login-account" aria-label="Current account">
      <BrandLogo size="large" />
      <h1>You’re already signed in</h1>
      <p>Current account: <strong>{user.email}</strong></p>
      <p>{role === ROLES.SUPERADMIN ? "Platform administration" : authCafeSlug ? `Cafe: ${authCafeSlug}` : "Your account profile is unavailable."}</p>
      <p>Other tabs in this browser use the same signed-in account.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        {target && <Link className="primary-button" to={target}>Continue to my dashboard</Link>}
        <button className="ghost-button" type="button" disabled={submitting} onClick={async () => {
          setSubmitting(true); setError("")
          try { await logout(); setEmail(""); setPassword(""); setResetSent(false) }
          catch (err) { setError(toUserMessage(err, "We couldn’t sign you out. Please try again.")) }
          finally { setSubmitting(false) }
        }}>Sign out to use another account</button>
      </div>
    </section></main>
  }

  const submit = async (event) => {
    event.preventDefault()
    if (submitting) return
    setError("")
    setSubmitting(true)
    try {
      const res = await login(email, password, null, routeCafeSlug)
      const userCafeSlug = res?.cafeSlug
      const from = location.state?.from?.pathname || ""
      const fromValid =
        userCafeSlug && from.startsWith(`/${userCafeSlug}/`) && !from.endsWith("/login") && !from.endsWith("/403")
      const target = fromValid ? from : getRoleRoute(res.role, userCafeSlug)
      navigate(target, { replace: true })
    } catch (err) {
      setError(toUserMessage(err, "We couldn’t sign you in. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  const requestReset = async () => {
    if (!emailRef.current?.reportValidity() || submitting) return
    setSubmitting(true); setResetting(true); setError(""); setResetSent(false)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
      if (resetError) throw resetError
      setResetSent(true)
    } catch { setError("Could not send the reset link. Please try again.") }
    finally { setSubmitting(false); setResetting(false) }
  }

  return (
    <main className="login-page">
      <Link to="/" className="login-back"><ArrowLeft size={16} /> Back to home</Link>
      <div className="login-wrap">
        <Link to="/" aria-label="DigiMenu home" className="login-brand"><BrandLogo size="large" /></Link>
        <form className="auth-card login-form" onSubmit={submit} aria-labelledby="login-title" aria-busy={submitting}>
          <header className="login-heading">
            <h1 id="login-title">Sign in</h1>
            <p>{routeCafeSlug ? "Welcome back to your cafe workspace." : "Welcome back. Sign in to your workspace."}</p>
          </header>
          <label className="field" htmlFor="login-email"><span>Email</span>
            <input ref={emailRef} id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={email} onChange={event => { setEmail(event.target.value); setResetSent(false) }} placeholder="you@example.com" required disabled={submitting} />
          </label>
          <div className="field">
            <div className="login-label-row"><label htmlFor="login-password">Password</label>
              <button className="login-text-button" type="button" disabled={submitting} onClick={requestReset}>{resetting ? "Sending…" : "Forgot password?"}</button>
            </div>
            <div className="login-password">
              <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required disabled={submitting} />
              <button className="login-reveal" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {error === "Use the platform sign-in page for your superadmin account." && <Link className="login-text-button" to="/login">Go to platform sign-in</Link>}
          {resetSent && <p className="success-note" role="status">If an account exists, a password reset link has been sent.</p>}
          <button className="primary-button login-submit" type="submit" disabled={submitting}>
            {submitting && !resetting ? <><LoaderCircle className="login-spinner" size={18} /> Signing in…</> : <>Sign in <ArrowRight size={18} /></>}
          </button>
          <p className="login-security"><LockKeyhole size={14} /> Secure access to your workspace</p>
        </form>
        <p className="login-signup">New to DigiMenu? <Link to="/pricing">Explore plans</Link></p>
      </div>
      <p className="login-copyright">© {new Date().getFullYear()} DigiMenu</p>
    </main>
  )
}
