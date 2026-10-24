import { NavLink, useLocation, useParams } from "react-router-dom"
import { LayoutDashboard, CreditCard, FileText, Settings, Users, Shield, TrendingUp, ClipboardList, Package, ListOrdered, Monitor, Bell, LogOut } from "lucide-react"
import { useAuth } from "../context/authContextValue"
import { useRBAC } from "../context/rbacContextValue"
import { usePlan } from "../context/planContextValue"
import { ROLE_NAV } from "../services/roleService"
import { PermissionGuard } from "../components/PermissionGuard"
import { NotificationCenter } from "../components/NotificationCenter"
import { LanguageToggle } from "../components/LanguageToggle"
import { BrandLogo } from "../components/BrandLogo"
import { ForcePasswordChangeModal } from "../components/ForcePasswordChangeModal"

const ICON_MAP = {
  LayoutDashboard, CreditCard, FileText,
  Settings, Users, Shield, TrendingUp, ClipboardList,
  Package, ListOrdered, Monitor, Bell,
}

export function RoleLayout({ children }) {
  const { logout } = useAuth()
  const { role, email } = useRBAC()
  const { hasFeature } = usePlan()
  const { cafeSlug } = useParams()
  const location = useLocation()
  const navItems = ROLE_NAV[role] || []
  // Lowercase so /cafe/POS and /cafe/KDS count as focused workspaces too.
  const isFocusedWorkspace = /\/[^/]+\/(?:pos|kds)\/?$/.test(location.pathname.toLowerCase())
  const hasRoleNavigation = !isFocusedWorkspace

  const cafePath = (to) => cafeSlug ? `/${cafeSlug}/${to}` : "/404"

  if (!navItems.length) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Unknown Role</h1>
          <p>Your account role is not recognized. Please contact an administrator.</p>
          <button className="ghost-button" type="button" onClick={logout} style={{ marginTop: "1rem" }}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className={`admin-shell role-${role}${hasRoleNavigation ? "" : " no-role-nav"}`}>
      {role !== "superadmin" ? <ForcePasswordChangeModal /> : null}
      {hasRoleNavigation ? (
        <aside className="admin-sidebar">
          <div className="sidebar-user">
            <BrandLogo size="medium" />
            <p className="admin-email">{email}</p>
          </div>
          <nav>
            {navItems.map((item) => {
              const Icon = ICON_MAP[item.icon]
              const isUnlocked = !item.feature || hasFeature(item.feature)

              // Restricted features must not surface in navigation.
              if (!isUnlocked) return null

              if (item.permission) {
                return (
                  <PermissionGuard key={item.to} permission={item.permission}>
                    <NavLink end={item.exact} to={cafePath(item.to)} data-label={item.label}>
                      {Icon ? <Icon size={16} /> : null}
                      {item.label}
                    </NavLink>
                  </PermissionGuard>
                )
              }
              return (
                <NavLink key={item.to} end={item.exact} to={cafePath(item.to)} data-label={item.label}>
                  {Icon ? <Icon size={16} /> : null}
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
          <div style={{ marginTop: "auto", padding: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              type="button"
              className="sidebar-signout"
              data-label="Sign out"
              onClick={logout}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--danger-text)",
                fontWeight: 700,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </aside>
      ) : null}
      <section className="admin-content">
        {!hasRoleNavigation ? <nav className="workspace-nav" aria-label="Workspace navigation">
          <BrandLogo size="small" />
          {navItems.filter((item) => !item.feature || hasFeature(item.feature)).map((item) => <NavLink key={item.to} to={cafePath(item.to)} end={item.exact}>{item.label}</NavLink>)}
          <button className="ghost-button" onClick={logout}>Sign out</button>
        </nav> : null}
        {hasRoleNavigation ? <div className="notif-corner" role="group" aria-label="Workspace controls"><LanguageToggle inline /><NotificationCenter /></div> : null}
        {children}
      </section>
    </main>
  )
}
