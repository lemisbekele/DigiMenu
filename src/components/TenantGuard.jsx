import { useEffect, useState } from "react"
import { useParams, Navigate, useLocation, Link } from "react-router-dom"
import { useAuth } from "../context/authContextValue"
import { ROLES } from "../services/roleService"
import { observeTenantAccess, TENANT_ACCESS } from "../services/tenantAccessService"
import { BrandLogo } from "./BrandLogo"

// Static sub-route names a cafe URL can contain. Anything on this list is
// matched case-insensitively and canonically redirected to its lowercase
// form, so /lemi-coffee/Barista behaves identically to /lemi-coffee/barista.
const KNOWN_SUB_ROUTES = new Set([
  "menu", "checkout", "order", "my-orders", "login",
  "admin", "dashboard", "orders", "manager", "pos", "cashier",
  "kds", "history", "inventory", "tables", "users", "audit-logs", "settings",
  "barista", "403",
])

// Second-level segments only valid directly under an admin area.
const KNOWN_ADMIN_SUB_ROUTES = new Set(["menu", "login", "403"])

function canonicalTenantPath(pathname) {
  const segments = pathname.split("/").filter(Boolean)
  let changed = false
  const normalized = segments.map((segment, index) => {
    const lower = segment.toLowerCase()
    // The cafe slug itself is validated case-insensitively everywhere — make
    // the address bar canonical too.
    const target =
      index === 0 ||
      (index === 1 && KNOWN_SUB_ROUTES.has(lower)) ||
      (index === 2 && segments[1]?.toLowerCase() === "admin" && KNOWN_ADMIN_SUB_ROUTES.has(lower))
        ? lower
        : segment
    if (target !== segment) changed = true
    return target
  })
  return changed ? `/${normalized.join("/")}` : null
}

export function TenantGuard({ children }) {
  const { cafeSlug } = useParams()
  const { user, loading, role, roleLoading, cafeSlug: authCafeSlug } = useAuth()
  const location = useLocation()
  const [tenantAccess, setTenantAccess] = useState(null)

  const currentSlug = String(cafeSlug || "").toLowerCase()

  const segments = location.pathname.split("/").filter(Boolean)
  const subRoute = (segments[1] || "").toLowerCase()
  const subSubRoute = (segments[2] || "").toLowerCase()
  const PUBLIC_SUB_ROUTES = ["menu", "checkout", "order", "my-orders", "login"]
  const isPublicRoute =
    !subRoute ||
    PUBLIC_SUB_ROUTES.includes(subRoute) ||
    (subRoute === "admin" && ["login", "403"].includes(subSubRoute))
  // Public cafe lookup does not depend on the staff session. In particular,
  // keep the login component mounted while its account validation finishes.
  const userId = isPublicRoute ? null : user?.id || null

  useEffect(() => { setTenantAccess(null); return observeTenantAccess(
    { slug: currentSlug, userId, requireStaff: Boolean(userId && !isPublicRoute) },
    setTenantAccess,
  ) }, [currentSlug, userId, isPublicRoute])

  // Canonicalize letter-casing before any guard logic runs:
  // /lemi-coffee/Barista, /Lemi-Coffee/MENU, /x/Admin/Login … all resolve to
  // one canonical lowercase URL so public/staff detection can never be
  // fooled by capitalization. Runs after every hook so the render order of
  // hooks stays identical across renders.
  const canonicalPath = canonicalTenantPath(location.pathname)
  if (canonicalPath) {
    return <Navigate to={{ pathname: canonicalPath, search: location.search, hash: location.hash }} replace />
  }

  if (!tenantAccess || (!isPublicRoute && (loading || roleLoading))) {
    return (
      <main className="page-pad splash-loader-container" style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
        <div className="skeleton-pulse" style={{ width: 120, height: 4, borderRadius: 2 }} />
      </main>
    )
  }

  if (tenantAccess.status === TENANT_ACCESS.UNAVAILABLE) {
    return <main className="auth-page"><div className="auth-card"><BrandLogo size="medium" /><h1>Temporarily unavailable</h1><p>We couldn’t open this cafe right now. Please try again in a moment.</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></div></main>
  }

  if (tenantAccess.status === TENANT_ACCESS.NOT_FOUND) {
    return <main className="auth-page"><div className="auth-card"><BrandLogo size="medium" /><h1>Cafe Not Found</h1><p>We couldn’t find this cafe. Check the link or ask the cafe for a new QR code.</p><Link className="primary-button" to="/">Back to home</Link></div></main>
  }
  if (tenantAccess.status === TENANT_ACCESS.INACTIVE) {
    return <main className="auth-page"><div className="auth-card"><BrandLogo size="medium" /><h1>Cafe Inactive</h1><p>This cafe is currently suspended. Contact the Super Admin.</p></div></main>
  }
  if (tenantAccess.status === TENANT_ACCESS.SUBSCRIPTION_INACTIVE) {
    return <main className="auth-page"><div className="auth-card"><BrandLogo size="medium" /><h1>Subscription Inactive</h1><p>This cafe does not have an approved active subscription.</p></div></main>
  }

  if (isPublicRoute) {
    return children
  }

  // Staff routes require login. Anonymous visitors must be sent to the login
  // form, never shown an access-denied page that leaks route existence.
  if (!user) {
    const loginPath = subRoute === "admin" ? `/${currentSlug}/admin/login` : `/${currentSlug}/login`
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  // The Superadmin role is the platform-owner domain, completely separate from
  // cafe tenants. Any platform owner poking at cafe staff routes is bounced to
  // their own console; they can switch accounts by signing out first.
  if (role === ROLES.SUPERADMIN || role === "superadmin") {
    return <Navigate to="/superadmin/dashboard" replace />
  }

  // Cafe Staff: Verify assigned cafe_slug matches URL parameter. A staff
  // account must never render another tenant's pages even when every record
  // query would be RLS-filtered anyway.
  const userCafeSlug = String(authCafeSlug || "").toLowerCase()

  // A signed-in user whose own profile row simply has not loaded yet is NOT
  // evidence of a cross-tenant violation. Pass through and let the route
  // level retry ("Account Problem" fallback in RoleRoute) resolve it — this
  // screen must only ever appear on positive evidence below.
  if (user && !userCafeSlug && tenantAccess.status === TENANT_ACCESS.READY) {
    return children
  }

  if (
    tenantAccess.status === TENANT_ACCESS.UNAUTHORIZED ||
    (userCafeSlug && userCafeSlug !== currentSlug)
  ) {
    return (
      <main className="auth-page">
        <div className="auth-card" style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ color: "#ef4444", marginBottom: "0.5rem" }}>Access Denied</h1>
          <p style={{ color: "#cbd5e1", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
            {userCafeSlug
              ? <>You are authenticated for <strong>{userCafeSlug}</strong> and cannot access <strong>{currentSlug}</strong>.</>
              : "Your account is not assigned to this cafe."}
          </p>
          {userCafeSlug ? (
            <a
              href={`/${userCafeSlug}/dashboard`}
              className="primary-button"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              Go to My Cafe Dashboard
            </a>
          ) : null}
        </div>
      </main>
    )
  }

  return children
}
