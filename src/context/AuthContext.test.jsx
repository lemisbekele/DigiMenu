import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthProvider } from "./AuthContext"
import { useAuth } from "./authContextValue"

const mock = vi.hoisted(() => ({
  observer: null, session: null, profile: null,
  login: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), signOut: vi.fn(), readProfile: vi.fn(), tenant: vi.fn(),
}))
vi.mock("../services/dataService", () => ({
  loginAdmin: (...args) => mock.login(...args), logoutAdmin: () => mock.signOut(), writeAuditLog: vi.fn(),
  observeAuth: callback => { mock.observer = callback; callback(mock.session); return () => {} },
}))
vi.mock("../services/notificationService", () => ({ setNotificationUser: vi.fn() }))
vi.mock("../services/tenantAccessService", () => ({
  TENANT_ACCESS: { READY: "ready", NOT_FOUND: "not_found", INACTIVE: "inactive", SUBSCRIPTION_INACTIVE: "subscription_inactive", UNAUTHORIZED: "unauthorized", UNAVAILABLE: "unavailable" },
  validateTenantAccess: (...args) => mock.tenant(...args),
}))
vi.mock("../services/supabase", () => ({ supabase: {
  auth: { getUser: (...args) => mock.getUser(...args), getSession: () => mock.getSession(), signOut: (...args) => mock.signOut(...args) },
  from: () => { const query = { select: () => query, eq: (_, id) => { query.id = id; return query }, maybeSingle: () => mock.readProfile(query.id) }; return query },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel }, removeChannel: async () => {},
} }))

const owner = { id: "owner-id", email: "owner@cafe.test" }
const platform = { id: "platform-id", email: "platform@cafe.test" }
const ownerProfile = { id: owner.id, role: "admin", cafe_slug: "cafe-a", cafe_id: "a" }
const platformProfile = { id: platform.id, role: "superadmin", cafe_slug: null, cafe_id: null }
let auth
function Probe() { auth = useAuth(); return null }
async function mount() { render(<AuthProvider><Probe /></AuthProvider>); await waitFor(() => expect(auth.loading).toBe(false)) }
function defer() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function signInAs(user, profile) {
  mock.profile = profile
  mock.login.mockImplementation(async () => { mock.session = user; mock.observer(user); return { user } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.session = null
  mock.profile = null
  mock.getUser.mockImplementation(async () => ({ data: { user: mock.session }, error: null }))
  mock.getSession.mockImplementation(async () => ({ data: { session: mock.session ? { user: mock.session } : null }, error: null }))
  mock.readProfile.mockImplementation(async () => ({ data: mock.profile, error: null }))
  mock.signOut.mockImplementation(async () => { mock.session = null; mock.observer(null); return { error: null } })
  mock.tenant.mockResolvedValue({ status: "ready" })
})

describe("account identity and sign-in isolation", () => {
  it("does not publish SIGNED_IN until server identity, role and cafe checks finish", async () => {
    await mount()
    signInAs(owner, ownerProfile)
    const gate = defer()
    mock.tenant.mockReturnValue(gate.promise)
    let attempt
    await act(async () => { attempt = auth.login(owner.email, "password", null, "cafe-a") })
    expect(auth.loading).toBe(true)
    expect(auth.user).toBeNull()
    expect(auth.role).toBeNull()
    await act(async () => { gate.resolve({ status: "ready" }); await attempt })
    expect(auth.user.id).toBe(owner.id)
    expect(auth.roleData.id).toBe(owner.id)
    expect(auth.cafeSlug).toBe("cafe-a")
  })

  it("rejects a platform account at a cafe login and removes its local session", async () => {
    await mount(); signInAs(platform, platformProfile)
    await act(async () => { await expect(auth.login(platform.email, "password", null, "cafe-a")).rejects.toThrow("platform sign-in") })
    expect(auth.user).toBeNull(); expect(auth.role).toBeNull()
    expect(mock.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mock.session).toBeNull()
  })

  it("rejects another cafe's credentials", async () => {
    await mount(); signInAs(owner, ownerProfile)
    await act(async () => { await expect(auth.login(owner.email, "password", null, "cafe-b")).rejects.toThrow("different cafe") })
    expect(auth.user).toBeNull(); expect(auth.cafeSlug).toBeNull()
  })

  it("does not allow an old browser account to satisfy different submitted credentials", async () => {
    await mount(); signInAs(owner, ownerProfile)
    await act(async () => { await expect(auth.login(platform.email, "password")).rejects.toThrow("could not sign you in") })
    expect(auth.user).toBeNull(); expect(mock.session).toBeNull()
  })

  it("rejects a profile belonging to a different identity", async () => {
    await mount(); signInAs(owner, platformProfile)
    await act(async () => { await expect(auth.login(owner.email, "password")).rejects.toThrow("Account validation") })
    expect(auth.role).toBeNull()
  })

  it("rejects a shared-session change while cafe validation is pending", async () => {
    await mount(); signInAs(owner, ownerProfile)
    const gate = defer(); mock.tenant.mockReturnValue(gate.promise)
    let attempt
    await act(async () => { attempt = auth.login(owner.email, "password", null, "cafe-a") })
    await act(async () => {
      mock.session = platform; mock.observer(platform)
      gate.resolve({ status: "ready" })
      await expect(attempt).rejects.toThrow("session changed")
    })
    expect(auth.user).toBeNull(); expect(auth.role).toBeNull()
  })

  it("discards a stale role query after an account change", async () => {
    await mount()
    const old = defer()
    mock.readProfile.mockImplementation(id => id === owner.id ? old.promise : Promise.resolve({ data: platformProfile, error: null }))
    await act(async () => { mock.observer(owner) })
    await act(async () => { mock.observer(platform) })
    expect(auth.role).toBe("superadmin")
    await act(async () => { old.resolve({ data: ownerProfile, error: null }) })
    expect(auth.user.id).toBe(platform.id)
    expect(auth.roleData.id).toBe(platform.id)
    expect(auth.role).toBe("superadmin")
    expect(auth.cafeSlug).toBeNull()
  })

  it("clears a previous account when a credentials attempt fails", async () => {
    mock.session = owner; mock.profile = ownerProfile
    await mount(); await waitFor(() => expect(auth.role).toBe("admin"))
    mock.login.mockRejectedValue({ code: "invalid_credentials" })
    await act(async () => { await expect(auth.login(platform.email, "wrong")).rejects.toMatchObject({ code: "invalid_credentials" }) })
    expect(auth.user).toBeNull(); expect(auth.role).toBeNull(); expect(mock.session).toBeNull()
  })
})
