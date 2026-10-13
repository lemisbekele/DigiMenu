import { describe, expect, it, vi } from "vitest"
import { render, screen, act, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import App from "../App"
import { FEATURE_REGISTRY } from "../services/planService"

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
  cafes: [{ id: "cafe_1", slug: "lemi-coffee", name: "Lemi Coffee", status: "active" }],
  packages: [
    {
      id: "enterprise",
      name: "Enterprise",
      features: ["digitalMenu", "ordering", "staffAccess", "kds", "orderHistory", "cashierPos", "inventory", "notifications", "analytics", "menuManagement", "tables", "settings", "userManagement", "auditLogs", "multiLanguage"],
      status: "active",
    },
  ],
  menu_items: [],
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
    functions: { invoke: async () => ({ data: {}, error: null }) },
  },
}))

vi.mock("../services/monitoring", () => ({
  logClientEvent: vi.fn(),
  friendlyErrorMessage: (m) => m,
}))

vi.mock("../services/subscriptionService", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchSubscriptionRequests: async () => (await makeQuery("subscription_requests").select().then((r) => r)).data || [],
    observeSubscriptionRequests: (callback) => {
      let active = true
      const load = async () => {
        if (!active) return
        callback(((await makeQuery("subscription_requests").select().then((r) => r)).data) || [])
      }
      load()
      return () => { active = false }
    },
  }
})

async function renderApp(entry) {
  window.history.replaceState({}, "", entry)
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <App />
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 300))
  })
}

function signInAs(role, cafeSlug = "lemi-coffee") {
  const cafe = tableData.cafes.find((c) => c.slug === cafeSlug)
  tableData.user_roles = [
    { id: "u1", email: `${role}@lemi.test`, role, cafe_id: cafe?.id || null, cafe_slug: cafeSlug, disabled: false, must_change_password: false },
  ]
  tableData.subscription_requests = [
    { id: "sub-lemi", status: "active", plan_key: "enterprise", cafe_id: cafe?.id || null, cafe_slug: cafeSlug, customer_admin_id: "u1" },
  ]
  mockAuth.user = { id: "u1", email: `${role}@lemi.test`, user_metadata: {} }
}

function seedLogin(role, cafeSlug = "lemi-coffee") {
  const cafe = tableData.cafes.find((c) => c.slug === cafeSlug)
  tableData.user_roles = [
    { id: "u1", email: `${role}@lemi.test`, role, cafe_id: cafe?.id || null, cafe_slug: cafeSlug, disabled: false, must_change_password: false },
  ]
  tableData.subscription_requests = [
    { id: "sub-lemi", status: "active", plan_key: "enterprise", cafe_id: cafe?.id || null, cafe_slug: cafeSlug, customer_admin_id: "u1" },
  ]
  mockAuth.loginUser = { id: "u1", email: `${role}@lemi.test`, user_metadata: {} }
}

describe("url case handling", () => {
  beforeEach(() => {
    tableData.user_roles = []
    tableData.subscription_requests = []
    mockAuth.user = null
  })

  it("anonymous visitor at /lemi-coffee/barista is sent to login", async () => {
    await renderApp("/lemi-coffee/barista")
    expect(await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("anonymous visitor at /lemi-coffee/Barista (capitalized) is sent to login", async () => {
    await renderApp("/lemi-coffee/Barista")
    expect(await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("signed-in barista lands on the KDS at /lemi-coffee/Barista (capitalized)", async () => {
    signInAs("barista")
    await renderApp("/lemi-coffee/Barista")
    expect(await screen.findByText("Kitchen KDS", {}, { timeout: 10000 })).toBeInTheDocument()
  })

  it("capitalized public menu /lemi-coffee/Menu stays public (no login wall)", async () => {
    tableData.menu_items = [{ id: "m1", name: "Macchiato", price: 50, category: "Drinks", calories: 90, available: true }]
    await renderApp("/lemi-coffee/Menu?table=3")
    expect(await screen.findByText("Macchiato", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument()
  })

  it("capitalized admin area /lemi-coffee/Admin sends anonymous visitors to the admin login", async () => {
    await renderApp("/lemi-coffee/Admin")
    expect(await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })).toBeInTheDocument()
  })

  it("full journey: /Barista → login → sign in as barista → lands in the KDS", async () => {
    seedLogin("barista")
    await renderApp("/lemi-coffee/Barista")

    // Anonymous visitor is sent to the cafe staff login.
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 10000 })

    // Signing in as the barista returns them to the staff console — the
    // original /Barista target resolves to the KDS, never back to the form.
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "barista@lemi.test" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "barista-pass" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByText("Kitchen KDS", {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument()
  }, 20000)
})
