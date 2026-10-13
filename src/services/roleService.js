import { supabase } from "./supabase"
import { assertPlanFeature } from "./planService"

export const ROLES = {
  BARISTA: "barista",
  CASHIER: "cashier",
  MANAGER: "manager",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
}

export const ROLE_LABELS = {
  [ROLES.BARISTA]: "Barista / Kitchen Staff",
  [ROLES.CASHIER]: "Cashier",
  [ROLES.MANAGER]: "Manager",
  [ROLES.ADMIN]: "Admin",
  [ROLES.SUPERADMIN]: "Super Admin (Platform Owner)",
}

export const ROLE_ROUTES = {
  [ROLES.SUPERADMIN]: "/superadmin",
  [ROLES.ADMIN]: "/admin",
  [ROLES.MANAGER]: "/manager",
  [ROLES.CASHIER]: "/cashier",
  [ROLES.BARISTA]: "/barista",
}

export const ROUTE_ROLES = Object.fromEntries(
  Object.entries(ROLE_ROUTES).map(([role, route]) => [route, role]),
)

export function getRoleRoute(role, cafeSlug = null) {
  if (role === ROLES.SUPERADMIN) return "/superadmin/dashboard"
  if (!cafeSlug) return null
  const slug = cafeSlug
  if (role === ROLES.ADMIN) return `/${slug}/dashboard`
  if (role === ROLES.MANAGER) return `/${slug}/dashboard`
  if (role === ROLES.CASHIER) return `/${slug}/pos`
  if (role === ROLES.BARISTA) return `/${slug}/kds`
  return null
}

export function getRouteRole(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean)
  if (!parts.length) return null
  if (parts[0] === "superadmin") return ROLES.SUPERADMIN
  const sub = parts[1] || ""
  if (sub === "kds" || sub === "barista") return ROLES.BARISTA
  if (sub === "pos" || sub === "cashier") return ROLES.CASHIER
  if (sub === "manager") return ROLES.MANAGER
  if (sub === "dashboard" || sub === "admin") return ROLES.ADMIN
  return ROUTE_ROLES["/" + parts[0]] || null
}

export const PERMISSIONS = {
  ORDERS_READ: "orders:read",
  ORDERS_CREATE: "orders:create",
  ORDERS_UPDATE: "orders:update",
  ORDERS_DELETE: "orders:delete",
  PAYMENT_PROCESS: "payment:process",
  PAYMENT_READ: "payment:read",
  DISCOUNT_APPLY: "discount:apply",
  TABLE_MANAGE: "table:manage",
  TABLE_ASSIGN: "table:assign",
  MENU_READ: "menu:read",
  MENU_CREATE: "menu:create",
  MENU_UPDATE: "menu:update",
  MENU_DELETE: "menu:delete",
  MENU_AVAILABILITY: "menu:availability",
  INVENTORY_READ: "inventory:read",
  INVENTORY_MANAGE: "inventory:manage",
  USER_READ: "user:read",
  USER_MANAGE: "user:manage",
  ROLE_MANAGE: "role:manage",
  REPORT_READ: "report:read",
  REPORT_SALES: "report:sales",
  REPORT_FINANCIAL: "report:financial",
  AUDIT_READ: "audit:read",
  SETTINGS_READ: "settings:read",
  SETTINGS_MANAGE: "settings:manage",
  SYSTEM_CONFIG: "system:config",
  SCHEDULE_MANAGE: "schedule:manage",
  ATTENDANCE_MANAGE: "attendance:manage",
  VENDOR_MANAGE: "vendor:manage",
  INTEGRATION_MANAGE: "integration:manage",
  SUBSCRIPTION_MANAGE: "subscription:manage",
}

const ROLE_PERMISSIONS = {
  [ROLES.BARISTA]: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.INVENTORY_READ,
  ],
  [ROLES.CASHIER]: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.PAYMENT_PROCESS,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.DISCOUNT_APPLY,
    PERMISSIONS.TABLE_ASSIGN,
    PERMISSIONS.MENU_READ,
  ],
  [ROLES.MANAGER]: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.PAYMENT_PROCESS,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.DISCOUNT_APPLY,
    PERMISSIONS.TABLE_MANAGE,
    PERMISSIONS.TABLE_ASSIGN,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.MENU_CREATE,
    PERMISSIONS.MENU_UPDATE,
    PERMISSIONS.MENU_DELETE,
    PERMISSIONS.MENU_AVAILABILITY,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.REPORT_SALES,
    PERMISSIONS.SCHEDULE_MANAGE,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.ORDERS_DELETE,
    PERMISSIONS.PAYMENT_PROCESS,
    PERMISSIONS.PAYMENT_READ,
    PERMISSIONS.DISCOUNT_APPLY,
    PERMISSIONS.TABLE_MANAGE,
    PERMISSIONS.TABLE_ASSIGN,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.MENU_CREATE,
    PERMISSIONS.MENU_UPDATE,
    PERMISSIONS.MENU_DELETE,
    PERMISSIONS.MENU_AVAILABILITY,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.ROLE_MANAGE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.REPORT_SALES,
    PERMISSIONS.REPORT_FINANCIAL,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.SYSTEM_CONFIG,
    PERMISSIONS.SCHEDULE_MANAGE,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.VENDOR_MANAGE,
    PERMISSIONS.INTEGRATION_MANAGE,
  ],
  [ROLES.SUPERADMIN]: [
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.SYSTEM_CONFIG,
    PERMISSIONS.SUBSCRIPTION_MANAGE,
  ],
}

export function hasPermission(userRole, permission) {
  return Boolean(ROLE_PERMISSIONS[userRole]?.includes(permission))
}

export function hasAnyPermission(userRole, permissions) {
  return permissions.some((permission) => hasPermission(userRole, permission))
}

export function hasAllPermissions(userRole, permissions) {
  return permissions.every((permission) => hasPermission(userRole, permission))
}

export function getRolePermissions(role) {
  return [...(ROLE_PERMISSIONS[role] || [])]
}

export async function fetchUserRole(uid) {
  if (!uid) return null
  const { data, error } = await supabase
    .from("user_roles")
    .select("role, disabled")
    .eq("id", uid)
    .maybeSingle()
  if (error || !data) return null
  if (data.disabled) return null
  return data.role
}

export async function syncRoleToSupabase(uid, _email, role) {
  if (role !== ROLES.SUPERADMIN) {
    assertPlanFeature("userManagement")
  }
  const { error } = await supabase.rpc("set_user_role", {
    p_uid: uid,
    p_role: role,
  })
  if (error) throw error
}

export async function setUserDisabled(uid, disabled) {
  assertPlanFeature("userManagement")
  const { error } = await supabase.rpc("set_user_disabled", {
    p_uid: uid,
    p_disabled: disabled,
  })
  if (error) throw error
}

// Cafe-staff navigation only. The Superadmin console defines its own layout
// (SuperAdminLayout) and never passes through RoleLayout, so there is no
// SUPERADMIN entry here — adding one would only describe routes the guard
// immediately redirects away.
export const ROLE_NAV = {
  [ROLES.ADMIN]: [
    { to: "dashboard", label: "Dashboard", icon: "LayoutDashboard", exact: true, feature: "analytics" },
    { to: "orders", label: "Orders", icon: "ClipboardList", feature: "ordering" },
    { to: "admin/menu", label: "Menu", icon: "FileText", permission: PERMISSIONS.MENU_UPDATE, feature: "menuManagement" },
    { to: "tables", label: "Tables", icon: "LayoutDashboard", permission: PERMISSIONS.TABLE_MANAGE, feature: "tables" },
    { to: "users", label: "Users", icon: "Users", permission: PERMISSIONS.USER_MANAGE, feature: "userManagement" },
    { to: "inventory", label: "Inventory", icon: "Package", permission: PERMISSIONS.INVENTORY_READ, feature: "inventory" },
    { to: "audit-logs", label: "Audit Logs", icon: "FileText", permission: PERMISSIONS.AUDIT_READ, feature: "auditLogs" },
    { to: "settings", label: "Settings", icon: "Settings", permission: PERMISSIONS.SETTINGS_MANAGE, feature: "settings" },
  ],
  [ROLES.MANAGER]: [
    { to: "dashboard", label: "Dashboard", icon: "TrendingUp", exact: true, feature: "analytics" },
    { to: "orders", label: "Orders", icon: "ClipboardList", feature: "ordering" },
    { to: "admin/menu", label: "Menu", icon: "FileText", feature: "menuManagement" },
    { to: "tables", label: "Tables", icon: "LayoutDashboard", permission: PERMISSIONS.TABLE_MANAGE, feature: "tables" },
    { to: "audit-logs", label: "Audit Logs", icon: "FileText", permission: PERMISSIONS.AUDIT_READ, feature: "auditLogs" },
    { to: "inventory", label: "Inventory", icon: "Package", permission: PERMISSIONS.INVENTORY_READ, feature: "inventory" },
  ],
  [ROLES.CASHIER]: [
    { to: "pos", label: "POS & Payments", icon: "CreditCard", exact: true, feature: "cashierPos" },
    { to: "orders", label: "Orders", icon: "ClipboardList", feature: "ordering" },
    { to: "tables", label: "Tables", icon: "LayoutDashboard", permission: PERMISSIONS.TABLE_ASSIGN, feature: "tables" },
  ],
  [ROLES.BARISTA]: [
    { to: "kds", label: "Kitchen", icon: "Monitor", exact: true, feature: "kds" },
    { to: "history", label: "History", icon: "ListOrdered", feature: "orderHistory" },
    { to: "inventory", label: "Inventory", icon: "Package", feature: "inventory" },
  ],
}
