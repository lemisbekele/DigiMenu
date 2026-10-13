import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/authContextValue"

function getLoginPath(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean)
  const slug = parts[0] || ""
  if (slug === "superadmin") return "/superadmin/login"
  if (!slug) return "/superadmin/login"
  // Case-insensitive so /cafe/Admin/... deep links land on the admin login.
  if ((parts[1] || "").toLowerCase() === "admin") return `/${slug}/admin/login`
  return `/${slug}/login`
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="page-pad">Checking session...</div>
  if (!user) return <Navigate to={getLoginPath(location.pathname)} replace state={{ from: location }} />
  return children
}
