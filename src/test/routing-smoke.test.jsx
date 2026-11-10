import { describe, expect, it, vi } from "vitest"
import { render, screen, act, fireEvent } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { useLayoutEffect } from "react"
import App from "../App"
import { FEATURE_REGISTRY } from "../services/planService"
import { AuthProvider } from "../context/AuthContext"
import { PlanProvider } from "../context/PlanContext"
import { LanguageProvider } from "../context/LanguageContext"
import { RBACProvider } from "../context/RBACContext"

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserverStub {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
}

const tableData = {
  features: Object.values(FEATURE_REGISTRY).map(f => ({ ...f, enabled: true })),
  cafes: [
    { id: "cafe_1", slug: "abyssinia-roast", name: "Abyssinia Roast", status: "active" },
    { id: "cafe_2", slug: "sunrise-cafe", name: "Sunrise Cafe", status: "active" },
    { id: "cafe_3", slug: "test-coffee-2", name: "Test Coffee", status: "active" },
  ],
  packages: [
    // Mirrors the seeded production catalog (migration
    // 20260820000008_plan_rbac_enforcement.sql) so plan-gated routes behave
    // exactly as they do against Supabase.
    { id: "starter", name: "Starter", features: ["digitalMenu", "ordering"], status: "active" },
    { id: "professional", name: "Professional", features: ["digitalMenu", "ordering", "staffAccess", "kds", "orderHistory", "cashierPos", "inventory", "notifications", "analytics", "menuManagement", "tables", "settings"], status: "active" },
    { id: "enterprise", name: "Enterprise", features: ["digitalMenu", "ordering", "staffAccess", "kds", "orderHistory", "cashierPos", "inventory", "notifications", "analytics", "menuManagement", "tables", "settings", "userManagement", "auditLogs", "multiLanguage"], status: "active" },
  ],
  menu_items: [
    { id: "m1", name: "Macchiato", price: 50, category: "Drinks", calories: 90, available: true },
    { id: "m2", name: "Tea", price: 30, category: "Drinks", calories: 5, available: true },
  ],
  orders: [],
  tables: [],
  payment_options: [],
  settings: [],
  audit_logs: [],
  user_roles: [],
  push_subscriptions: [],
  announcements: [],
}

const mockAuth = { user: null, loginUser: null, failLogin: false, authCallback: null }

function makeQuery(table) {
  const filters = []
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (col, val) => {
      filters.push([col, val])
      return builder
    },
    single: async () => ({ data: applyFilters()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: applyFilters()[0] ?? null, error: null }),
    insert: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    update: async () => ({ data: null, error: null }),
    delete: async () => ({ data: null, error: null }),
    then: async (resolve) => resolve({ data: applyFilters(), error: null }),
  }
  function applyFilters() {
    let rows = tableData[table] || []
    for (const [col, val] of filters) {
      rows = rows.filter((r) => String(r[col]) === String(val))
    }
    return rows
  }
  return builder
}

vi.mock("../services/supabase", () => ({
  supabase: {
    from: (table) => makeQuery(table),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }), unsubscribe: vi.fn() }),
    removeChannel: async () => {},
    auth: {
      getUser: async () => ({ data: { user: mockAuth.user }, error: null }),
      getSession: async () => ({ data: { session: mockAuth.user ? { user: mockAuth.user } : null }, error: null }),
      onAuthStateChange: (callback) => {
        mockAuth.authCallback = callback
        callback("INITIAL_SESSION", mockAuth.user ? { user: mockAuth.user } : null)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      signInWithPassword: async () => {
        if (mockAuth.failLogin) {
          return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } }
        }
        const session = { user: mockAuth.loginUser }
        mockAuth.user = mockAuth.loginUser
        mockAuth.authCallback?.("SIGNED_IN", session)
        return { data: { user: mockAuth.loginUser, session }, error: null }
      },
      signOut: async () => {
        mockAuth.user = null
        mockAuth.authCallback?.("SIGNED_OUT", null)
        return { error: null }
      },
      updateUser: async () => ({ error: null }),
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    rpc: async (name, params) => {
      if (name === "get_public_cafe") return { data: tableData.cafes.filter((c) => c.slug === params.p_cafe_slug), error: null }
      if (name === "get_staff_orders" || name === "get_cafe_inventory") return { data: [], error: null }
      if (name === "get_public_billing_settings") return { data: [{ tax_rate: 15, tax_label: "VAT" }], error: null }
      if (name === "get_public_payment_options") return { data: [], error: null }
      if (name === "get_public_menu") {
        const slug = String(params?.p_cafe_slug || "").toLowerCase()
        return {
          data: tableData.menu_items.filter((item) => !item.cafe_slug || String(item.cafe_slug).toLowerCase() === slug),
          error: null,
        }
      }
      return { data: null, error: null }
    },
  },
}))

vi.mock("../services/monitoring", () => ({
  logClientEvent: vi.fn(),
  friendlyErrorMessage: (m) => m,
}))

// Subscription reads must always reflect the current tableData — the real
// service keeps a short-lived in-memory cache that would leak a previous
// test's seeded subscription into the next test.
vi.mock("../services/subscriptionService", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchSubscriptionRequests: async (statusFilter = null) => {
      const res = await makeQuery("subscription_requests").select().then((r) => r)
      const rows = res.data || []
      return statusFilter ? rows.filter((r) => r.status === statusFilter) : rows
    },
    observeSubscriptionRequests: (callback) => {
      let active = true
      const load = async () => {
        if (!active) return
        const res = await makeQuery("subscription_requests").select().then((r) => r)
        callback(res.data || [])
      }
      load()
      return () => {
        active = false
      }
    },
  }
})

async function renderApp(entry) {
  window.history.replaceState({}, "", entry)
  function PathProbe() {
    const location = useLocation()
    useLayoutEffect(() => { window.history.replaceState({}, "", location.pathname + location.search) }, [location])
    return null
  }
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <PathProbe />
        <App />
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 300))
  })
}

function signInAs(role, cafeSlug = "abyssinia-roast") {
  const slug = cafeSlug || ""
  const cafe = tableData.cafes.find((entry) => entry.slug === slug)
  tableData.user_roles = [
    { id: "u1", role, cafe_id: cafe?.id || null, cafe_slug: cafeSlug, disabled: false, must_change_password: false },
  ]
  mockAuth.user = {
    id: "u1",
    email: slug ? `${role}@${slug}.com` : "platform-owner@digimenu.app",
    user_metadata: {},
  }
  if (slug && role !== "superadmin") {
    tableData.subscription_requests = [{
      id: `sub-${slug}`,
      status: "active",
      plan_key: "enterprise",
      cafe_id: cafe?.id || null,
      cafe_slug: slug,
      customer_admin_id: "u1",
    }]
  }
}

function seedRole(role, cafeSlug = "abyssinia-roast") {
  const slug = cafeSlug || ""
  const cafe = tableData.cafes.find((entry) => entry.slug === slug)
  tableData.user_roles = [
    { id: "u1", role, cafe_id: cafe?.id || null, cafe_slug: cafeSlug, disabled: false, must_change_password: false },
  ]
  mockAuth.loginUser = {
    id: "u1",
    email: slug ? `${role}@${slug}.com` : "platform-owner@digimenu.app",
    user_metadata: {},
  }
  mockAuth.failLogin = false
  if (slug && role !== "superadmin") {
    tableData.subscription_requests = [{
      id: `sub-${slug}`,
      status: "active",
      plan_key: "enterprise",
      cafe_id: cafe?.id || null,
      cafe_slug: slug,
      customer_admin_id: "u1",
    }]
  }
}

describe("routing smoke test", () => {
  beforeEach(() => {
    tableData.user_roles = []
    tableData.subscription_requests = []
    mockAuth.user = null
    mockAuth.loginUser = null
    mockAuth.failLogin = false
  })

  it("renders portfolio root", async () => {
    await import("../pages/PortfolioPage")
    await renderApp("/")
    expect(await screen.findByRole("heading", { name: /Less juggling/i }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("renders menu page for existing cafe slug", async () => {
    await renderApp("/abyssinia-roast/menu?table=1")
    expect(await screen.findByText("Macchiato", {}, { timeout: 10000 })).toBeInTheDocument()
  })

  it("renders cafe index route", async () => {
    await renderApp("/abyssinia-roast?table=1")
    expect(await screen.findByText("Tea", {}, { timeout: 10000 })).toBeInTheDocument()
  })

  it("renders helpful not-found guidance for unknown cafe slug", async () => {
    await renderApp("/non-existent-cafe/menu")
    expect(await screen.findByRole("heading", { name: "Cafe Not Found" }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("renders scan page when no table param", async () => {
    await renderApp("/abyssinia-roast/menu")
    expect(await screen.findByText("Please scan your table QR code", {}, { timeout: 10000 })).toBeInTheDocument()
  })

  it("opens KDS for barista", async () => {
    signInAs("barista")
    await renderApp("/abyssinia-roast/kds")
    expect(await screen.findByRole("heading", { name: "Kitchen", level: 1 }, { timeout: 10000 })).toBeInTheDocument()
  }, 15000)

  it("opens POS for cashier", async () => {
    signInAs("cashier")
    await renderApp("/abyssinia-roast/pos")
    expect(await screen.findByRole("heading", { name: "Payments", level: 1 }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("opens dashboard for admin", async () => {
    signInAs("admin")
    await renderApp("/abyssinia-roast/dashboard")
    await new Promise((r) => setTimeout(r, 800))
    expect((await screen.findAllByText("Dashboard", {}, { timeout: 10000 })).length).toBeGreaterThan(0)
  })

  it("opens dashboard for manager", async () => {
    signInAs("manager")
    await renderApp("/abyssinia-roast/dashboard")
    expect((await screen.findAllByText("Dashboard", {}, { timeout: 10000 })).length).toBeGreaterThan(0)
  })

  it("opens admin menu for manager", async () => {
    signInAs("manager")
    await renderApp("/abyssinia-roast/admin/menu")
    expect(await screen.findByText("Add item", {}, { timeout: 10000 })).toBeInTheDocument()
  })

  it("bounces barista from POS to KDS", async () => {
    signInAs("barista")
    await renderApp("/abyssinia-roast/pos")
    expect(await screen.findByRole("heading", { name: "Kitchen", level: 1 }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("renders provider stack with a simple route", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/x"]}>
          <AuthProvider>
            <PlanProvider>
              <LanguageProvider>
                <RBACProvider>
                  <Routes>
                    <Route path="*" element={<div>STACK-OK</div>} />
                  </Routes>
                </RBACProvider>
              </LanguageProvider>
            </PlanProvider>
          </AuthProvider>
        </MemoryRouter>,
      )
      await new Promise((r) => setTimeout(r, 200))
    })
    expect(screen.getByText("STACK-OK")).toBeInTheDocument()
  })

  it("redirects logged-out /admin to admin login", async () => {
    await import("../pages/AdminLogin")
    await renderApp("/abyssinia-roast/admin")
    expect(await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("shows error and stays on admin login for invalid credentials", async () => {
    await import("../pages/AdminLogin")
    seedRole("admin")
    mockAuth.failLogin = true
    await renderApp("/abyssinia-roast/admin/login")
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@abyssinia-roast.com" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByText("The email or password is incorrect. Please try again.", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument()
  })

  it("logs in valid admin and lands on /admin dashboard", async () => {
    await import("../pages/AdminLogin")
    seedRole("admin")
    await renderApp("/abyssinia-roast/admin")
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@abyssinia-roast.com" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "admin-pass" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect((await screen.findAllByText("Dashboard", {}, { timeout: 10000 })).length).toBeGreaterThan(0)
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument()
  }, 15000)

  it("keeps authenticated admin on /admin", async () => {
    signInAs("admin")
    await renderApp("/abyssinia-roast/admin")
    expect((await screen.findAllByText("Dashboard", {}, { timeout: 10000 })).length).toBeGreaterThan(0)
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument()
  })

  it("denies non-admin access to /admin without falling back to menu", async () => {
    signInAs("barista")
    await renderApp("/abyssinia-roast/admin")
    expect(await screen.findByText("Access Denied", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByText("Please scan your table QR code")).not.toBeInTheDocument()
    expect(screen.queryByText("Macchiato")).not.toBeInTheDocument()
  })

  it("logs out from denied page and returns to admin login", async () => {
    await import("../pages/AdminLogin")
    await import("../pages/AccessDenied")
    signInAs("barista")
    await renderApp("/abyssinia-roast/admin")
    await screen.findByText("Access Denied", {}, { timeout: 10000 })
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    expect(await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("sends unknown admin subpaths to admin login when logged out", async () => {
    await import("../pages/AdminLogin")
    await renderApp("/abyssinia-roast/admin/users")
    expect(await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("superadmin signs in at /superadmin/login and lands on the platform dashboard", async () => {
    await import("../pages/SuperAdminDashboard")
    seedRole("superadmin", null)
    await renderApp("/superadmin/login")
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "platform-owner@digimenu.app" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "platform-pass" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByText("Platform Overview", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument()
  })

  it("identifies the remembered superadmin before continuing to their dashboard", async () => {
    await import("../pages/SuperAdminDashboard")
    signInAs("superadmin", null)
    await renderApp("/superadmin/login")
    expect(await screen.findByText("platform-owner@digimenu.app")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: "Continue to my dashboard" }))
    expect(await screen.findByText("Platform Overview", {}, { timeout: 10000 })).toBeInTheDocument()
  })

  it("routes cafe admin credentials at the legacy login to their own dashboard", async () => {
    seedRole("admin")
    await renderApp("/superadmin/login")
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@abyssinia-roast.com" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "admin-pass" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByText("Business Dashboard", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByText("Platform Overview")).not.toBeInTheDocument()
  })

  it("rejects superadmin credentials at cafe admin login", async () => {
    await import("../pages/AdminLogin")
    seedRole("superadmin", null)
    await renderApp("/test-coffee-2/admin/login")
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "platform-owner@digimenu.app" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "platform-pass" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Use the platform sign-in page for your superadmin account.")
    expect(window.location.pathname).toBe("/test-coffee-2/admin/login")
    expect(mockAuth.user).toBeNull()
    expect(screen.queryByText("Platform Overview")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Payments", level: 1 })).not.toBeInTheDocument()
  }, 20000)

  it("sends a signed-in superadmin from a cafe admin area to the platform dashboard", async () => {
    await import("../pages/AdminLogin")
    signInAs("superadmin", null)
    await renderApp("/test-coffee-2/admin")
    // The platform-owner domain is separate from cafe tenants: the guard
    // must never open a cafe staff/admin area for a superadmin — it bounces
    // them to their own console instead.
    expect(await screen.findByText("Platform Overview", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Payments", level: 1 })).not.toBeInTheDocument()
  })

  it("blocks a signed-in cafe admin from the platform dashboard", async () => {
    signInAs("admin")
    await renderApp("/superadmin/dashboard")
    expect(await screen.findByText("admin@abyssinia-roast.com")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Continue to my dashboard" })).toHaveAttribute("href", "/abyssinia-roast/dashboard")
    fireEvent.click(screen.getByRole("link", { name: "Continue to my dashboard" }))
    expect(await screen.findByText("Business Dashboard", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByText("Platform Overview")).not.toBeInTheDocument()
  }, 20000)

  it("denies a test-coffee-2 admin access to another cafe admin area", async () => {
    signInAs("admin", "test-coffee-2")
    await renderApp("/sunrise-cafe/admin")
    expect(await screen.findByText("Access Denied", {}, { timeout: 10000 })).toBeInTheDocument()
  })

  it("blocks a cafe admin immediately when their active subscription is revoked", async () => {
    signInAs("admin", "test-coffee-2")
    tableData.subscription_requests = [{
      id: "sub-test-coffee-2",
      status: "expired",
      cafe_id: "cafe_3",
      cafe_slug: "test-coffee-2",
      customer_admin_id: "u1",
    }]
    await renderApp("/test-coffee-2/admin")
    expect(await screen.findByText("Subscription Inactive", {}, { timeout: 10000 })).toBeInTheDocument()
  })

  it("logs in a test-coffee-2 admin at their own cafe admin login", async () => {
    await import("../pages/AdminLogin")
    seedRole("admin", "test-coffee-2")
    await renderApp("/test-coffee-2/admin/login")
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@test-coffee-2.com" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "admin-pass" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect((await screen.findAllByText("Dashboard", {}, { timeout: 10000 })).length).toBeGreaterThan(0)
  }, 15000)

  it("scopes the cafe admin user list to the authenticated cafe only", async () => {
    await import("../pages/UserManagement")
    signInAs("admin", "test-coffee-2")
    tableData.user_roles = [
      { id: "u1", email: "tc-admin@test-coffee-2.com", role: "admin", cafe_slug: "test-coffee-2", disabled: false, must_change_password: false },
      { id: "u_sun", email: "sunrise-admin@sunrise-cafe.com", role: "admin", cafe_slug: "sunrise-cafe", disabled: false, must_change_password: false },
    ]
    tableData.subscription_requests = [
      { id: "sub_tc", cafe_slug: "test-coffee-2", status: "active", plan_key: "enterprise" },
    ]
    // The service keeps a short-lived module cache of subscription requests;
    // force a refresh so the seeded enterprise plan is picked up.
    const { fetchSubscriptionRequests } = await import("../services/subscriptionService")
    await fetchSubscriptionRequests(null, true)
    await renderApp("/test-coffee-2/users")
    expect(await screen.findByRole("heading", { name: "Team", level: 1 }, { timeout: 10000 })).toBeInTheDocument()
    expect(await screen.findByText("tc-admin@test-coffee-2.com", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByText("sunrise-admin@sunrise-cafe.com")).not.toBeInTheDocument()
  }, 20000)
  it("redirects the legacy subscriptions route into the access workspace", async () => {
    signInAs("superadmin", null)
    await renderApp("/superadmin/subscriptions")
    expect(await screen.findByRole("heading", { name: "Access & subscriptions" })).toBeInTheDocument()
    expect(await screen.findByRole("link", { name: "Subscriptions & history" })).toHaveAttribute("aria-current", "page")
    expect(await screen.findByRole("heading", { name: "Current assignments by package" })).toBeInTheDocument()
  })

  it("keeps the singular cafe bookmark working without a duplicate page", async () => {
    signInAs("superadmin", null)
    await renderApp("/superadmin/cafe")
    expect(await screen.findByRole("heading", { name: "Cafe Management" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Cafes" })).toHaveAttribute("aria-current", "page")
  })

})
