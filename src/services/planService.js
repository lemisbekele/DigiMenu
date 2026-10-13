// Package (plan) service — which features a cafe's plan unlocks.

// ---------------------------------------------------------------------------
// FEATURE_REGISTRY — the platform feature catalog as known to the frontend.
// Supabase (`features` table + `packages.features`) is the authoritative
// source at runtime. This registry describes implemented route and UI
// capabilities only; package membership lives exclusively in Supabase.
// ---------------------------------------------------------------------------
export const FEATURE_REGISTRY = {
  digitalMenu: {
    key: "digitalMenu",
    name: "Digital Menu",
    description: "Digital menu with calories, customizations and QR access.",
    routes: ["/:cafeSlug", "/:cafeSlug/menu"],
    navItems: ["menu"],
    permissions: ["menu:read"],
    backend: ["menu_items:read"],
  },
  ordering: {
    key: "ordering",
    name: "Online Ordering",
    description: "Cart, checkout and customer order tracking.",
    routes: ["/:cafeSlug/checkout", "/:cafeSlug/order/:orderId", "/:cafeSlug/my-orders"],
    navItems: [],
    permissions: ["orders:create"],
    backend: ["orders:insert", "orders:read"],
  },
  staffAccess: {
    key: "staffAccess",
    name: "Staff Access",
    description: "Role-based staff consoles and secure login.",
    routes: ["/:cafeSlug/dashboard", "/:cafeSlug/orders", "/:cafeSlug/pos", "/:cafeSlug/kds"],
    navItems: [],
    permissions: [],
    backend: ["user_roles:read"],
  },
  kds: {
    key: "kds",
    name: "Kitchen Display System",
    description: "Kitchen Display System with timers, stations and ready-to-serve flow.",
    routes: ["/:cafeSlug/kds"],
    navItems: ["kds", "kitchen"],
    permissions: ["orders:read", "orders:update"],
    backend: ["orders:read", "orders:update"],
  },
  orderHistory: {
    key: "orderHistory",
    name: "Kitchen Order History",
    description: "Browse completed kitchen orders with item breakdowns.",
    routes: ["/:cafeSlug/history"],
    navItems: ["history"],
    permissions: ["orders:read"],
    backend: ["orders:read"],
  },
  cashierPos: {
    key: "cashierPos",
    name: "Cashier POS",
    description: "Cashier POS with bank proof upload and payment approval.",
    routes: ["/:cafeSlug/pos"],
    navItems: ["pos", "cashier"],
    permissions: ["orders:create", "payment:process"],
    backend: ["orders:insert", "payment_options:read"],
  },
  inventory: {
    key: "inventory",
    name: "Inventory Management",
    description: "Track stock, low-stock alerts and supplier costs.",
    routes: ["/:cafeSlug/inventory"],
    navItems: ["inventory"],
    permissions: ["inventory:read", "inventory:manage"],
    backend: ["inventory:read", "inventory:write"],
  },
  notifications: {
    key: "notifications",
    name: "Notifications & Order Alerts",
    description: "Real-time order alerts, push notifications and announcements.",
    routes: [],
    navItems: ["notifications"],
    permissions: [],
    backend: ["push_subscriptions:write"],
  },
  analytics: {
    key: "analytics",
    name: "Dashboard & Analytics",
    description: "Sales dashboards, reports and trend analysis.",
    routes: ["/:cafeSlug/dashboard"],
    navItems: ["dashboard"],
    permissions: ["report:read", "report:sales"],
    backend: ["orders:read", "audit_logs:read"],
  },
  menuManagement: {
    key: "menuManagement",
    name: "Menu Management",
    description: "Create, edit and organize menu items with pricing and availability.",
    routes: ["/:cafeSlug/admin/menu"],
    navItems: ["menu"],
    permissions: ["menu:create", "menu:update", "menu:delete", "menu:availability"],
    backend: ["menu_items:insert", "menu_items:update", "menu_items:delete"],
  },
  tables: {
    key: "tables",
    name: "Table Management",
    description: "Manage tables, QR codes and table assignments.",
    routes: ["/:cafeSlug/tables"],
    navItems: ["tables"],
    permissions: ["table:manage", "table:assign"],
    backend: ["tables:insert", "tables:update", "tables:delete"],
  },
  settings: {
    key: "settings",
    name: "Cafe Settings",
    description: "Billing settings, payment options and cafe configuration.",
    routes: ["/:cafeSlug/settings"],
    navItems: ["settings"],
    permissions: ["settings:read", "settings:manage"],
    backend: ["settings:update", "payment_options:write"],
  },
  userManagement: {
    key: "userManagement",
    name: "User Management",
    description: "Create staff accounts, assign roles and manage access.",
    routes: ["/:cafeSlug/users"],
    navItems: ["users"],
    permissions: ["user:read", "user:manage", "role:manage"],
    backend: ["user_roles:insert", "user_roles:update", "user_roles:delete"],
  },
  auditLogs: {
    key: "auditLogs",
    name: "Audit Logs",
    description: "Full audit trail of platform and cafe activity.",
    routes: ["/:cafeSlug/audit-logs"],
    navItems: ["audit-logs"],
    permissions: ["audit:read"],
    backend: ["audit_logs:read"],
  },
  multiLanguage: {
    key: "multiLanguage",
    name: "Multi-Language",
    description: "English, Amharic and Afaan Oromo language support.",
    routes: [],
    navItems: [],
    permissions: [],
    backend: [],
  },
}

// Registry-derived metadata is intentionally not a package definition.
export const FEATURES = Object.values(FEATURE_REGISTRY).map((info) => ({
  key: info.key,
  label: info.name,
}))

// A cafe's plan is derived from its ACTIVE subscription (approved/active) in
// the subscription_requests cache. Without a real subscription the cafe gets
// no features at all.
const STORED_PLAN_KEY = "cafe_active_plan"

export function getActivePlan() {
  try {
    const stored = localStorage.getItem(STORED_PLAN_KEY)
    if (stored && resolveCachedPackages().some((p) => p?.id === stored)) return stored
  } catch {}
  return null
}

export function setActivePlan(plan) {
  if (!resolveCachedPackages().some((p) => p?.id === plan)) throw new Error(`Unknown plan: ${plan}`)
  localStorage.setItem(STORED_PLAN_KEY, plan)
}

export function planHasFeature(featureKey, plan) {
  return resolveFeatureKeys(plan, resolveCachedPackages()).includes(featureKey)
}

export function getFeatureInfo(featureKey) {
  return FEATURE_REGISTRY[featureKey] || null
}

// ---------------------------------------------------------------------------
// Effective entitlement resolution — the runtime source of truth.
// ---------------------------------------------------------------------------
export function resolveFeatureKeys(planKey, packages = null) {
  if (packages && Array.isArray(packages)) {
    const pkg = packages.find((p) => p?.id === planKey)
    if (pkg && pkg.status !== "inactive" && Array.isArray(pkg.features)) return [...new Set(pkg.features)].filter(key => FEATURE_REGISTRY[key])
  }
  // Entitlements are never inferred from a frontend fallback. Supabase is
  // authoritative: no package snapshot means no feature access.
  return []
}

export function resolvePlanMeta(planKey, packages = null) {
  if (packages && Array.isArray(packages)) {
    const pkg = packages.find((p) => p?.id === planKey)
    if (pkg && pkg.name) {
      return {
        key: planKey,
        label: pkg.name,
        price: pkg.price || "",
        period: pkg.period || "",
        description: pkg.description || "",
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Synchronous service-layer guard. Non-React services (dataService, roleService)
// use this to reject operations the cafe's assigned package does not include.
// It reads the same caches PlanContext keeps fresh, so it stays in sync with
// the realtime package/subscription data without async round-trips.
// ---------------------------------------------------------------------------
const SUBSCRIPTION_CACHE_KEY = "cafe_subscription_requests"
const PACKAGES_CACHE_KEY = "cafe_packages_cache"
const CURRENT_CAFE_KEY = "cafe_current_slug"

export function isSubscriptionActive(subscription, now = Date.now()) {
  return ["active", "approved"].includes(String(subscription?.status || "").toLowerCase()) &&
    (!subscription.expired_at || new Date(subscription.expired_at).getTime() > now)
}

export class PlanFeatureError extends Error {
  constructor(featureKey, planKey, message) {
    super(message || `This feature (${featureKey}) is not included in your current package.`)
    this.name = "PlanFeatureError"
    this.featureKey = featureKey
    this.planKey = planKey
  }
}

export function setCurrentCafeSlug(slug) {
  if (!slug) return
  try {
    localStorage.setItem(CURRENT_CAFE_KEY, slug)
  } catch {}
}

export function getCurrentCafeSlug() {
  try {
    return localStorage.getItem(CURRENT_CAFE_KEY) || null
  } catch {
    return null
  }
}

export function resolveCafePlanKey(cafeSlug = getCurrentCafeSlug()) {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_CACHE_KEY)
    const subs = raw ? JSON.parse(raw) : []
    if (Array.isArray(subs) && cafeSlug) {
      const active = subs.find(
        (s) =>
          isSubscriptionActive(s) &&
          (s.cafe_slug || "").toLowerCase() === cafeSlug.toLowerCase(),
      )
      // Package identity comes only from the Supabase packages catalog.
      const planKey = String(active?.plan_key || "").trim().toLowerCase()
      if (planKey && resolveCachedPackages().some((p) => p?.id === planKey && p.status !== "inactive")) {
        return planKey
      }
    }
  } catch {}
  return null
}

export function resolveCachedPackages() {
  try {
    const raw = localStorage.getItem(PACKAGES_CACHE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function cachePackages(packages) {
  try {
    localStorage.setItem(PACKAGES_CACHE_KEY, JSON.stringify(packages || []))
  } catch {}
}

// The synchronous service-layer guards read this snapshot between React
// renders. It is populated exclusively from a successful Supabase query.
export function cacheSubscriptionRequests(subscriptions) {
  try {
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(subscriptions || []))
  } catch {}
}

// Entitlement snapshots must never survive an auth boundary: RLS hides
// tenant rows from anonymous users, so a pre-login snapshot is always
// empty and a post-login one is authoritative.
export function clearCachedSubscriptionRequests() {
  try {
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY)
  } catch {}
}

export function assertPlanFeature(featureKey, cafeSlug = getCurrentCafeSlug()) {
  const planKey = resolveCafePlanKey(cafeSlug)
  const features = resolveFeatureKeys(planKey, resolveCachedPackages())
  if (planKey && features.includes(featureKey)) return true
  throw new PlanFeatureError(
    featureKey,
    planKey,
    planKey
      ? `Feature "${featureKey}" is not included in the "${planKey}" package assigned to this cafe.`
      : `This cafe has no active subscription, so the "${featureKey}" feature is unavailable.`,
  )
}
