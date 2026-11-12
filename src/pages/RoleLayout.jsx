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
import "../ui/shell.css"
import "./superadmin.css"

const ICON_MAP = {
  LayoutDashboard, CreditCard, FileText,
  Settings, Users, Shield, TrendingUp, ClipboardList,
  Package, ListOrdered, Monitor, Bell, Inbox, Coffee, Megaphone,
}

// Platform owner's links. Absolute paths; cafe roles use ROLE_NAV (relative to the cafe slug).
const SUPERADMIN_NAV = [
  { to: "/superadmin/dashboard", group: "Platform", label: "Dashboard", icon: "LayoutDashboard" },
  { to: "/superadmin/requests", group: "Platform", label: "Access & subscriptions", icon: "Inbox" },
  { to: "/superadmin/cafes", group: "Platform", label: "Cafes", icon: "Coffee" },
  { to: "/superadmin/packages", group: "Platform", label: "Packages", icon: "Package" },
  { to: "/superadmin/announcements", group: "Manage", label: "Announcements", icon: "Megaphone" },
  { to: "/superadmin/audit-logs", group: "Manage", label: "Audit Logs", icon: "FileText" },
]

// One frame for every signed-in role: navigation | page | optional detail panel (see ui/DetailPanel).
// Only the links and the page change with the role.
export function RoleLayout({ children }) {
  const { logout } = useAuth()
  const { role, email } = useRBAC()
  const { hasFeature } = usePlan()
  const { cafeSlug } = useParams()
  const isSuperadmin = role === ROLES.SUPERADMIN
  // Restricted features must not surface in navigation.
  const navItems = (isSuperadmin ? SUPERADMIN_NAV : ROLE_NAV[role] || []).filter((item) => !item.feature || hasFeature(item.feature))
  const groups = [...new Set(navItems.map((item) => item.group))]

  const linkPath = (to) => (to.startsWith("/") ? to : cafeSlug ? `/${cafeSlug}/${to}` : "/404")

  if (!isSuperadmin && !(ROLE_NAV[role] || []).length) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Unknown Role</h1>
          <p>Your account role is not recognized. Please contact an administrator.</p>
          <button className="ui-btn" type="button" onClick={logout}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </main>
    )
  }

  const renderLink = (item) => {
    const Icon = ICON_MAP[item.icon]
    const link = (
      <NavLink key={item.to} end={item.exact} to={linkPath(item.to)}>
        {Icon ? <Icon size={16} /> : null}
        <span>{item.label}</span>
      </NavLink>
    )
    return item.permission
      ? <PermissionGuard key={item.to} permission={item.permission}>{link}</PermissionGuard>
      : link
  }

  return (
    <main className={`ui-shell role-${role}`}>
      {!isSuperadmin ? <ForcePasswordChangeModal /> : null}
      <aside className="ui-nav">
        <div className="ui-nav-brand">
          <BrandLogo size="medium" />
          {isSuperadmin
            ? <Link to="/superadmin/profile" className="ui-nav-email" title="Account & security">{email}</Link>
            : <p className="ui-nav-email">{email}</p>}
        </div>
        <nav className="ui-nav-links" aria-label="Main">
          {groups.map((group) => (
            <div className="ui-nav-group" role="group" aria-label={group} key={group}>
              <span className="ui-nav-group-label" aria-hidden="true">{group}</span>
              {navItems.filter((item) => item.group === group).map(renderLink)}
            </div>
          ))}
        </nav>
        <div className="ui-nav-foot">
          <button type="button" className="ui-nav-signout" onClick={logout} aria-label="Sign out" title="Sign out">
            <LogOut size={16} /> <span>Sign out</span>
          </button>
        </div>
      </aside>
      <section className="ui-main">
        <div className="ui-shell-controls" role="group" aria-label="Workspace controls"><LanguageToggle inline /><NotificationCenter /></div>
        {/* Superadmin pages are still styled under .sa-shell until they move to the shared parts. */}
        {isSuperadmin ? <div className="sa-shell sa-embedded">{children}</div> : children}
      </section>
      {/* Filled by <DetailPanel> through a portal; empty means no third column. */}
      <aside className="ui-detail" id="ui-detail-slot" aria-live="polite" />
    </main>
  )
}
