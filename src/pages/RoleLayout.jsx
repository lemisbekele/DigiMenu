import { Link, NavLink, useParams } from "react-router-dom"
import {
  LayoutDashboard, CreditCard, FileText, Settings, Users, Shield, TrendingUp, ClipboardList,
  Package, ListOrdered, Monitor, Bell, LogOut, Inbox, Coffee, Megaphone,
} from "lucide-react"
import { useAuth } from "../context/authContextValue"
import { useRBAC } from "../context/rbacContextValue"
import { usePlan } from "../context/planContextValue"
import { ROLE_NAV, ROLES } from "../services/roleService"
import { PermissionGuard } from "../components/PermissionGuard"
import { NotificationCenter } from "../components/NotificationCenter"
import { LanguageToggle } from "../components/LanguageToggle"
import { BrandLogo } from "../components/BrandLogo"
import { ForcePasswordChangeModal } from "../components/ForcePasswordChangeModal"
import "./staff-shell.css"
import "./superadmin.css"

const ICON_MAP = {
  LayoutDashboard, CreditCard, FileText,
  Settings, Users, Shield, TrendingUp, ClipboardList,
  Package, ListOrdered, Monitor, Bell, Inbox, Coffee, Megaphone,
}

// Platform owner's links. Absolute paths; cafe roles use ROLE_NAV (relative to the cafe slug).
const SUPERADMIN_NAV = [
  { to: "/superadmin/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { to: "/superadmin/requests", label: "Access & subscriptions", icon: "Inbox" },
  { to: "/superadmin/cafes", label: "Cafes", icon: "Coffee" },
  { to: "/superadmin/packages", label: "Packages", icon: "Package" },
  { to: "/superadmin/announcements", label: "Announcements", icon: "Megaphone" },
  { to: "/superadmin/audit-logs", label: "Audit Logs", icon: "FileText" },
]

// One shell for every signed-in role: same sidebar, same place; only the links and page change.
export function RoleLayout({ children }) {
  const { logout } = useAuth()
  const { role, email } = useRBAC()
  const { hasFeature } = usePlan()
  const { cafeSlug } = useParams()
  const isSuperadmin = role === ROLES.SUPERADMIN
  const navItems = isSuperadmin ? SUPERADMIN_NAV : ROLE_NAV[role] || []

  const linkPath = (to) => (to.startsWith("/") ? to : cafeSlug ? `/${cafeSlug}/${to}` : "/404")

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
    <main className={`admin-shell role-${role}`}>
      {!isSuperadmin ? <ForcePasswordChangeModal /> : null}
      <aside className="admin-sidebar">
        <div className="sidebar-user">
          <BrandLogo size="medium" />
          {isSuperadmin
            ? <Link to="/superadmin/profile" className="admin-email" title="Account & security">{email}</Link>
            : <p className="admin-email">{email}</p>}
        </div>
        <nav>
          {navItems.map((item) => {
            // Restricted features must not surface in navigation.
            if (item.feature && !hasFeature(item.feature)) return null
            const Icon = ICON_MAP[item.icon]
            const link = (
              <NavLink key={item.to} end={item.exact} to={linkPath(item.to)} data-label={item.label}>
                {Icon ? <Icon size={20} /> : null}
                <span>{item.label}</span>
              </NavLink>
            )
            return item.permission
              ? <PermissionGuard key={item.to} permission={item.permission}>{link}</PermissionGuard>
              : link
          })}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="sidebar-signout" data-label="Sign out" onClick={logout} aria-label="Sign out" title="Sign out">
            <LogOut size={18} /> <span>Sign out</span>
          </button>
        </div>
      </aside>
      <section className="admin-content">
        <div className="notif-corner" role="group" aria-label="Workspace controls"><LanguageToggle inline /><NotificationCenter /></div>
        {/* Superadmin pages are styled under .sa-shell; sa-embedded drops its old full-page layout. */}
        {isSuperadmin ? <div className="sa-shell sa-embedded">{children}</div> : children}
      </section>
    </main>
  )
}
