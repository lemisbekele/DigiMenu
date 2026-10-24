import { ShieldX } from "lucide-react"
import { Link, Navigate, useParams } from "react-router-dom"
import { useAuth } from "../context/authContextValue"
import { getRoleRoute } from "../services/roleService"
import { BrandLogo } from "../components/BrandLogo"

export function AccessDenied() {
  const { cafeSlug } = useParams()
  const { user, role, logout } = useAuth()
  const slug = cafeSlug || ""

  if (!user) {
    return <Navigate to={`/${slug}/admin/login`} replace />
  }

  const home = getRoleRoute(role, slug)

  return (
    <main className="auth-page">
      <div className="auth-card" style={{ maxWidth: 460, textAlign: "center" }}>
        <BrandLogo size="medium" style={{ justifyContent: "center", marginBottom: 16 }} />
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 16px",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "var(--danger-soft)",
            color: "var(--danger-text)",
          }}
        >
          <ShieldX size={26} />
        </div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>Access Denied</h1>
        <p style={{ color: "var(--text-3)", marginBottom: 16, lineHeight: 1.6 }}>
          Your account does not have permission to view this page.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {home ? (
            <Link to={home} className="primary-button" style={{ display: "inline-flex", alignItems: "center" }}>
              Go to my home
            </Link>
          ) : null}
          <button type="button" className="ghost-button" onClick={() => logout().catch(() => {})}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  )
}
