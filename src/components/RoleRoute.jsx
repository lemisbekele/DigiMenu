import { useEffect, useState } from "react"
import { Navigate, useParams } from "react-router-dom"
import { useAuth } from "../context/authContextValue"
import { getRoleRoute, ROLES } from "../services/roleService"

const KNOWN_ROLES = new Set(Object.values(ROLES))

export function RoleRoute({ role, fallback = null, children }) {
  const { user, loading, roleLoading, role: userRole, cafeSlug: authCafeSlug, logout, refreshRole } = useAuth()
  const params = useParams()
  const cafeSlug = params.cafeSlug || authCafeSlug || ""
  const allowedRoles = Array.isArray(role) ? role : [role]
  const [retried, setRetried] = useState(false)

  // A signed-in user whose profile (role/cafe) read transiently failed must
  // never be bounced to the login form as if they were logged out. Retry the
  // profile load once; if it still cannot resolve, show an account error.
  const profileMissing = Boolean(user) && (!userRole || (userRole !== ROLES.SUPERADMIN && !authCafeSlug))
  useEffect(() => {
    if (!profileMissing || retried || loading || roleLoading) return
    setRetried(true)
    refreshRole(user.id)?.catch(() => {})
  }, [profileMissing, retried, loading, roleLoading, user, refreshRole])

  // Only block render on initial verification before user or role is known.
  // Once authenticated with a role, background loading must NEVER unmount children.
  if (!user || !userRole) {
    if (loading || roleLoading || (profileMissing && !retried)) {
      if (fallback) return fallback
      return <div className="page-pad">Verifying access...</div>
    }
    return <Navigate to={`/${cafeSlug}/login`} replace />
  }

  // Session exists but the account profile is unusable (missing row, no cafe
  // assignment, or the reload above failed). Never send a signed-in user to
  // the login page — give them a way out instead.
  if (!userRole || !KNOWN_ROLES.has(userRole) || !cafeSlug) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Account Problem</h1>
          <p>
            We could not load your account profile
            {!userRole ? "" : ` (unrecognized role "${userRole}")`}. Please sign
            out and sign in again, or contact your administrator.
          </p>
          <button
            className="ghost-button"
            type="button"
            onClick={() => logout().catch(() => {})}
            style={{ marginTop: "1rem" }}
          >
            Sign out
          </button>
        </div>
      </main>
    )
  }

  if (userRole === ROLES.SUPERADMIN) return <Navigate to="/superadmin/dashboard" replace />
  if (authCafeSlug && cafeSlug.toLowerCase() !== authCafeSlug.toLowerCase()) return <Navigate to={getRoleRoute(userRole, authCafeSlug)} replace />

  // Cafe staff domain only. The Superadmin role is the platform-owner domain
  // and must not auto-satisfy cafe staff checks; it is redirected to its own
  // platform routes instead.
  if (!allowedRoles.includes(userRole)) {
    return <Navigate to={getRoleRoute(userRole, cafeSlug)} replace />
  }

  return children
}
