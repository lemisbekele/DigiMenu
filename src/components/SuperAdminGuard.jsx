import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/authContextValue"
import { ROLES } from "../services/roleService"

export function SuperAdminGuard({ children }) {
  const { user, loading, role, roleLoading } = useAuth()
  const location = useLocation()

  if (loading || roleLoading) {
    return (
      <main className="page-pad splash-loader-container" style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
        <div className="skeleton-pulse" style={{ width: 120, height: 4, borderRadius: 2 }} />
      </main>
    )
  }

  if (!user || (role !== ROLES.SUPERADMIN && role !== "superadmin")) {
    return <Navigate to="/superadmin/login" state={{ from: location }} replace />
  }

  return children
}
