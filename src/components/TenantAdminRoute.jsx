import { Navigate, useLocation, useParams } from "react-router-dom"
import { useAuth } from "../context/authContextValue"
import { ROLES } from "../services/roleService"

export function TenantAdminRoute({ children }) {
  const { cafeSlug } = useParams()
  const { user, loading, roleLoading, role, cafeSlug: authCafeSlug } = useAuth()
  const location = useLocation()

  // Only block render on initial verification before user or role is known.
  // Once authenticated, background loading must NEVER unmount children.
  if (!user || !role) {
    if (loading || roleLoading) {
      return (
        <main className="page-pad splash-loader-container" style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
          <div className="skeleton-pulse" style={{ width: 120, height: 4, borderRadius: 2 }} />
        </main>
      )
    }
    return (
      <Navigate
        to={cafeSlug ? `/${cafeSlug}/admin/login` : "/404"}
        replace
        state={{ from: location }}
      />
    )
  }

  const routeSlug = (cafeSlug || "").toLowerCase()
  const userCafeSlug = String(authCafeSlug || "").toLowerCase()

  // Cafe Admin domain only: the authenticated role must be admin AND the
  // authenticated tenant must match the route slug. Superadmin is a separate
  // platform domain and must never satisfy a cafe admin check.
  if (role !== ROLES.ADMIN || userCafeSlug !== routeSlug) {
    return (
      <Navigate
        to={`/${routeSlug}/admin/403`}
        replace
        state={{ from: location }}
      />
    )
  }

  return children
}
