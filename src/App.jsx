import { lazy, Suspense } from "react"
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { RoleRoute } from "./components/RoleRoute"
import { AuthProvider } from "./context/AuthContext"
import { CartProvider } from "./context/CartContext"
import { LanguageProvider } from "./context/LanguageContext"
import { ThemeProvider } from "./context/ThemeContext"
import { TableProvider } from "./context/TableContext"
import { RBACProvider } from "./context/RBACContext"
import { RoleLayout } from "./pages/RoleLayout"
import { ROLES } from "./services/roleService"
import { PlanProvider } from "./context/PlanContext"
import { PlanRoute } from "./components/PlanGate"
import "./App.css"

const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs").then((m) => ({ default: m.AdminAuditLogs })))
const AccessDenied = lazy(() => import("./pages/AccessDenied").then((m) => ({ default: m.AccessDenied })))
const AdminMenu = lazy(() => import("./pages/AdminMenu").then((m) => ({ default: m.AdminMenu })))
const AdminOrders = lazy(() => import("./pages/AdminOrders").then((m) => ({ default: m.AdminOrders })))
const AdminSettings = lazy(() => import("./pages/AdminSettings").then((m) => ({ default: m.AdminSettings })))
const AdminTables = lazy(() => import("./pages/AdminTables").then((m) => ({ default: m.AdminTables })))
const CashierDashboard = lazy(() => import("./pages/CashierDashboard").then((m) => ({ default: m.CashierDashboard })))
const CheckoutPage = lazy(() => import("./pages/CheckoutPage").then((m) => ({ default: m.CheckoutPage })))
const MenuPage = lazy(() => import("./pages/MenuPage").then((m) => ({ default: m.MenuPage })))
const OrderPage = lazy(() => import("./pages/OrderPage").then((m) => ({ default: m.OrderPage })))
const KitchenKDS = lazy(() => import("./pages/KitchenKDS").then((m) => ({ default: m.KitchenKDS })))
const KitchenHistory = lazy(() => import("./pages/KitchenHistory").then((m) => ({ default: m.KitchenHistory })))
const KitchenInventory = lazy(() => import("./pages/KitchenInventory").then((m) => ({ default: m.KitchenInventory })))
const KitchenSettings = lazy(() => import("./pages/KitchenSettings").then((m) => ({ default: m.KitchenSettings })))
const MyOrdersPage = lazy(() => import("./pages/MyOrders").then((m) => ({ default: m.MyOrdersPage })))
const OwnerDashboard = lazy(() => import("./pages/OwnerDashboard").then((m) => ({ default: m.OwnerDashboard })))
const PortfolioPage = lazy(() => import("./pages/PortfolioPage").then((m) => ({ default: m.PortfolioPage || m.default })))
const PricingPage = lazy(() => import("./pages/PricingPage").then((m) => ({ default: m.PricingPage })))
const UserManagement = lazy(() => import("./pages/UserManagement").then((m) => ({ default: m.UserManagement })))
const SuperAdminPackages = lazy(() => import("./pages/SuperAdminPackages").then((m) => ({ default: m.SuperAdminPackages })))
const SuperAdminAnnouncements = lazy(() => import("./pages/SuperAdminAnnouncements").then((m) => ({ default: m.SuperAdminAnnouncements })))
const SuperAdminProfile = lazy(() => import("./pages/SuperAdminProfile").then((m) => ({ default: m.SuperAdminProfile })))
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard").then((m) => ({ default: m.SuperAdminDashboard })))
const SuperAdminAccess = lazy(() => import("./pages/SuperAdminAccess").then((m) => ({ default: m.SuperAdminAccess })))
const SuperAdminCafes = lazy(() => import("./pages/SuperAdminCafes").then((m) => ({ default: m.SuperAdminCafes })))

import { SuperAdminGuard } from "./components/SuperAdminGuard"
import { SuperAdminLayout } from "./components/SuperAdminLayout"
import { TenantAdminRoute } from "./components/TenantAdminRoute"
import { TenantGuard } from "./components/TenantGuard"
import { AdminLogin } from "./pages/AdminLogin"
import { BrandLogo } from "./components/BrandLogo"
import { ResetPassword } from "./pages/ResetPassword"
import { RegionalBoundary } from "./components/RegionalBoundary"

function PageFallback() {
  return (
    <main className="page-pad splash-loader-container" style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <BrandLogo size="large" style={{ marginBottom: 16 }} />
        <div className="skeleton-pulse" style={{ width: 120, height: 4, borderRadius: 2, margin: "0 auto" }} />
      </div>
    </main>
  )
}

function RoleRoutes({ role, children }) {
  return (
    <ProtectedRoute>
      <RoleRoute role={role}>
        <PlanRoute feature="staffAccess">
          <RoleLayout>{children}</RoleLayout>
        </PlanRoute>
      </RoleRoute>
    </ProtectedRoute>
  )
}

function GatedStaffRoute({ role, feature, children }) {
  return (
    <RoleRoutes role={role}>
      <PlanRoute feature={feature}>{children}</PlanRoute>
    </RoleRoutes>
  )
}

function CustomerLayout({ children }) {
  const { cafeSlug } = useParams()
  const { pathname } = useLocation()
  const section = pathname.split("/").filter(Boolean)[1]
  const showBrandFooter = !section || ["menu", "checkout", "order", "my-orders"].includes(section)
  return (
    <RegionalBoundary slug={cafeSlug}><TableProvider>
      <CartProvider key={cafeSlug}>{children}{showBrandFooter && <footer className="customer-brand-footer"><span>Powered by</span><BrandLogo size="small" /></footer>}</CartProvider>
    </TableProvider></RegionalBoundary>
  )
}

function CafeCatchAll() {
  const { cafeSlug } = useParams()
  const location = useLocation()
  const slug = cafeSlug || ""
  const segments = location.pathname.split("/").filter(Boolean)
  // Case-insensitive: /x/Admin/whatever is an admin-area typo, not a page.
  if ((segments[1] || "").toLowerCase() === "admin") {
    return <Navigate to={`/${slug}/admin`} replace />
  }
  return <NotFound />
}

function CafeRoleAlias({ target }) {
  const { cafeSlug } = useParams()
  return <Navigate to={`/${cafeSlug}/${target}`} replace />
}

function NotFound() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <BrandLogo size="medium" style={{ marginBottom: 12, justifyContent: "center" }} />
        <h1>404</h1>
        <p>The page you are looking for does not exist.</p>
        <a href="/pricing" className="primary-button" style={{ display: "inline-block", marginTop: "1rem" }}>
          View Plans
        </a>
      </div>
    </main>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <PlanProvider>
            <LanguageProvider>
              <RBACProvider>
                <Suspense fallback={<PageFallback />}>
                <Routes>
                  {/* 1. PUBLIC PORTFOLIO & MARKETING WEBSITE */}
                  <Route path="/" element={<PortfolioPage />} />
                  <Route path="/portfolio" element={<PortfolioPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/404" element={<NotFound />} />

                  {/* 2. SUPER ADMIN ENVIRONMENT (/superadmin/*) */}
                  <Route path="/login" element={<AdminLogin />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/superadmin/login" element={<Navigate to="/login" replace />} />
                  <Route path="/superadmin" element={<Navigate to="/superadmin/dashboard" replace />} />
                  <Route
                    path="/superadmin/*"
                    element={
                      <SuperAdminGuard>
                        <SuperAdminLayout>
                          <Routes>
                            <Route index element={<Navigate to="dashboard" replace />} />
                            <Route path="dashboard" element={<SuperAdminDashboard />} />
                            <Route path="requests" element={<SuperAdminAccess />} />
                            <Route path="cafe" element={<Navigate to="/superadmin/cafes" replace />} />
                            <Route path="cafes" element={<SuperAdminCafes />} />
                            <Route path="packages" element={<SuperAdminPackages />} />
                            <Route path="subscriptions" element={<Navigate to="/superadmin/requests?view=subscriptions" replace />} />
                            <Route path="audit-logs" element={<AdminAuditLogs />} />
                            <Route path="announcements" element={<SuperAdminAnnouncements />} />
                            <Route path="profile" element={<SuperAdminProfile />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </SuperAdminLayout>
                      </SuperAdminGuard>
                    }
                  />

                  {/* 3. MULTI-TENANT CAFE ENVIRONMENT (/:cafeSlug/*) */}
                  <Route
                    path="/:cafeSlug/*"
                    element={
                      <TenantGuard>
                        <CustomerLayout>
                          <Routes>
                            {/* Public Customer Pages for specific Cafe — ordering is
                                enforced server-side by create_customer_order, so these
                                render for anonymous visitors. */}
                            <Route index element={<MenuPage />} />
                            <Route path="menu" element={<MenuPage />} />
                            <Route path="checkout" element={<CheckoutPage />} />
                            <Route path="order/:orderId" element={<OrderPage />} />
                            <Route path="my-orders" element={<MyOrdersPage />} />
                            <Route path="login" element={<AdminLogin />} />
                            <Route path="admin/login" element={<AdminLogin />} />
                            <Route path="admin/403" element={<AccessDenied />} />
                            <Route
                              path="admin"
                              element={
                                <TenantAdminRoute>
                                  <GatedStaffRoute role={ROLES.ADMIN} feature="analytics"><OwnerDashboard /></GatedStaffRoute>
                                </TenantAdminRoute>
                              }
                            />

                            {/* Staff / Admin Pages for specific Cafe — each gated by its package feature */}
                            <Route path="dashboard" element={<GatedStaffRoute role={[ROLES.ADMIN, ROLES.MANAGER]} feature="analytics"><OwnerDashboard /></GatedStaffRoute>} />
                            <Route path="orders" element={<GatedStaffRoute role={[ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER]} feature="ordering"><AdminOrders /></GatedStaffRoute>} />
                            <Route path="manager" element={<CafeRoleAlias target="dashboard" />} />
                            <Route path="pos" element={<GatedStaffRoute role={ROLES.CASHIER} feature="cashierPos"><CashierDashboard /></GatedStaffRoute>} />
                            <Route path="cashier" element={<CafeRoleAlias target="pos" />} />
                            <Route path="kds" element={<GatedStaffRoute role={ROLES.BARISTA} feature="kds"><KitchenKDS /></GatedStaffRoute>} />
                            <Route path="barista" element={<CafeRoleAlias target="kds" />} />
                            <Route path="kds/settings" element={<GatedStaffRoute role={ROLES.BARISTA} feature="kds"><KitchenSettings /></GatedStaffRoute>} />
                            <Route path="history" element={<GatedStaffRoute role={ROLES.BARISTA} feature="orderHistory"><KitchenHistory /></GatedStaffRoute>} />
                            <Route path="inventory" element={<GatedStaffRoute role={[ROLES.ADMIN, ROLES.MANAGER, ROLES.BARISTA]} feature="inventory"><KitchenInventory /></GatedStaffRoute>} />
                            <Route path="tables" element={<GatedStaffRoute role={[ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER]} feature="tables"><AdminTables /></GatedStaffRoute>} />
                            <Route path="users" element={<GatedStaffRoute role={ROLES.ADMIN} feature="userManagement"><UserManagement /></GatedStaffRoute>} />
                            <Route path="audit-logs" element={<GatedStaffRoute role={[ROLES.ADMIN, ROLES.MANAGER]} feature="auditLogs"><AdminAuditLogs /></GatedStaffRoute>} />
                            <Route path="settings" element={<GatedStaffRoute role={ROLES.ADMIN} feature="settings"><AdminSettings /></GatedStaffRoute>} />
                            <Route path="admin/menu" element={<GatedStaffRoute role={[ROLES.ADMIN, ROLES.MANAGER]} feature="menuManagement"><AdminMenu /></GatedStaffRoute>} />
                            <Route path="*" element={<CafeCatchAll />} />
                          </Routes>
                        </CustomerLayout>
                      </TenantGuard>
                    }
                  />

                  {/* Platform entry points */}
                  <Route path="/menu" element={<Navigate to="/pricing" replace />} />
                  <Route path="/checkout" element={<Navigate to="/pricing" replace />} />
                  <Route path="/my-orders" element={<Navigate to="/pricing" replace />} />
                  <Route path="/admin/login" element={<Navigate to="/superadmin/login" replace />} />
                  <Route path="/admin" element={<Navigate to="/superadmin/login" replace />} />
                  <Route path="/admin/*" element={<Navigate to="/superadmin/login" replace />} />
                  <Route path="/manager" element={<Navigate to="/login" replace />} />
                  <Route path="/cashier" element={<Navigate to="/login" replace />} />
                  <Route path="/barista" element={<Navigate to="/login" replace />} />

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
</Suspense>
              </RBACProvider>
            </LanguageProvider>
          </PlanProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
