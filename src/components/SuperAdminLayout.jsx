import { useEffect, useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard, Inbox, Coffee, Package,
  Megaphone, FileText, LogOut, Menu,
} from "lucide-react"
import { useAuth } from "../context/authContextValue"
import { BrandLogo } from "./BrandLogo"
import "../pages/superadmin.css"

export function SuperAdminLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  useEffect(() => {
    if (!mobileDrawerOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prevOverflow }
  }, [mobileDrawerOpen])

  const handleLogout = async () => {
    try {
      await logout()
      navigate("/superadmin/login", { replace: true })
    } catch {
      navigate("/superadmin/login", { replace: true })
    }
  }

  const navGroups = [
    {
      label: "Overview",
      items: [{ to: "/superadmin/dashboard", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Clients & Access",
      items: [
        { to: "/superadmin/requests", label: "Access & subscriptions", icon: Inbox },
        { to: "/superadmin/cafes", label: "Cafes", icon: Coffee },
      ],
    },
    {
      label: "Packages",
      items: [
        { to: "/superadmin/packages", label: "Packages", icon: Package },
      ],
    },
    {
      label: "Platform",
      items: [
        { to: "/superadmin/announcements", label: "Announcements", icon: Megaphone },
        { to: "/superadmin/audit-logs", label: "Audit Logs", icon: FileText },
      ],
    },
  ]

  const closeDrawer = () => setMobileDrawerOpen(false)

  const navLinkClass = ({ isActive }) => (isActive ? "sa-nav-link is-active" : "sa-nav-link")

  const renderNavItems = (items) => (
    <nav className="sa-nav-list">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={closeDrawer}
            className={navLinkClass}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )

  return (
    <div className="sa-shell">
      {/* MOBILE DRAWER BACKDROP */}
      {mobileDrawerOpen && (
        <div className="sa-backdrop" onClick={closeDrawer} aria-hidden="true" />
      )}

      {/* SIDEBAR */}
      <aside className={`sa-sidebar ${mobileDrawerOpen ? "is-open" : ""}`} aria-label="Superadmin navigation">
        {/* BRANDING */}
        <div className="sa-brand">
          <div className="sa-brand-row">
            <div className="sa-brand-text">
              <BrandLogo size="medium" />
              <span className="sa-brand-sub">SUPERADMIN CONSOLE</span>
            </div>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div className="sa-nav-scroll">
          <div className="sa-nav-flat-list">
            {navGroups.map(group => <div key={group.label} className="sa-nav-group"><span className="sa-nav-group-label">{group.label}</span>{renderNavItems(group.items)}</div>)}
          </div>
          <button type="button" onClick={handleLogout} className="sa-nav-link sa-logout">
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>

        {/* LOGGED IN USER FOOTER */}
        <div className="sa-account-footer">
          <Link to="/superadmin/profile" onClick={closeDrawer} className="sa-account-row sa-account-link" aria-label="Account and security">
            <div className="sa-account-avatar">SA</div>
            <div className="sa-account-text">
              <strong className="sa-account-email">{user?.email || "Superadmin Account"}</strong>
              <span className="sa-account-role">Account &amp; security →</span>
            </div>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="sa-main">
        {/* TOPBAR */}
        <header className="sa-topbar">
          <div className="sa-topbar-title">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              className="sa-mobile-toggle"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileDrawerOpen}
            >
              <Menu size={18} />
              Menu
            </button>
            <strong>DigiMenu platform</strong>
          </div>

          <div className="sa-topbar-side">
            <span className="sa-topbar-chip">Platform administration</span>
            <Link to="/" className="sa-topbar-public-link">
              Public Site ↗
            </Link>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="sa-content">
          {children}
        </main>
      </div>
    </div>
  )
}
