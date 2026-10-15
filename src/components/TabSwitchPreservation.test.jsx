import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { SuperAdminGuard } from "./SuperAdminGuard"
import { TenantAdminRoute } from "./TenantAdminRoute"
import { RoleRoute } from "./RoleRoute"
import { TenantGuard } from "./TenantGuard"
import { PlanRoute } from "./PlanGate"

const authState = vi.hoisted(() => ({
  user: { id: "u-1", email: "admin@test.com" },
  loading: false,
  roleLoading: false,
  role: "superadmin",
  cafeSlug: null,
  refreshRole: vi.fn(),
  logout: vi.fn(),
}))

const planState = vi.hoisted(() => ({
  hasFeature: (feat) => feat === "kds" || feat === "ordering",
  subscriptionStatus: "active",
}))

vi.mock("../context/authContextValue", () => ({
  useAuth: () => authState,
}))

vi.mock("../context/planContextValue", () => ({
  usePlan: () => planState,
}))

const tenantMock = vi.hoisted(() => ({
  currentStatus: "ready",
  observer: null,
}))

vi.mock("../services/tenantAccessService", () => ({
  TENANT_ACCESS: { READY: "ready", NOT_FOUND: "not_found", UNAVAILABLE: "unavailable" },
  observeTenantAccess: (_, callback) => {
    tenantMock.observer = callback
    callback({ status: tenantMock.currentStatus })
    return () => {}
  },
}))

function TestForm({ label = "Secret Field" }) {
  const [val, setVal] = useState("")
  return (
    <div>
      <label htmlFor="test-input">{label}</label>
      <input
        id="test-input"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Type something..."
      />
    </div>
  )
}

describe("Tab switch / background revalidation form preservation for ALL users", () => {
  it("SuperAdminGuard preserves active form input when background roleLoading occurs", async () => {
    authState.user = { id: "sa-1", email: "sa@platform.test" }
    authState.role = "superadmin"
    authState.loading = false
    authState.roleLoading = false

    const { rerender } = render(
      <MemoryRouter initialEntries={["/superadmin/requests"]}>
        <Routes>
          <Route
            path="/superadmin/requests"
            element={
              <SuperAdminGuard>
                <TestForm label="Temporary Password" />
              </SuperAdminGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    const input = screen.getByLabelText("Temporary Password")
    await userEvent.type(input, "SecretTempPass123!")
    expect(input).toHaveValue("SecretTempPass123!")

    // Simulate tab switch triggering a background role revalidation
    authState.roleLoading = true
    rerender(
      <MemoryRouter initialEntries={["/superadmin/requests"]}>
        <Routes>
          <Route
            path="/superadmin/requests"
            element={
              <SuperAdminGuard>
                <TestForm label="Temporary Password" />
              </SuperAdminGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    // Input must still be in the document and hold the typed value
    const inputAfterRevalidation = screen.getByLabelText("Temporary Password")
    expect(inputAfterRevalidation).toHaveValue("SecretTempPass123!")
  })

  it("TenantAdminRoute preserves active form input when background roleLoading occurs", async () => {
    authState.user = { id: "admin-1", email: "admin@cafe.test" }
    authState.role = "admin"
    authState.cafeSlug = "lemi-coffee"
    authState.loading = false
    authState.roleLoading = false

    const { rerender } = render(
      <MemoryRouter initialEntries={["/lemi-coffee/admin/menu"]}>
        <Routes>
          <Route
            path="/:cafeSlug/admin/menu"
            element={
              <TenantAdminRoute>
                <TestForm label="Menu Item Name" />
              </TenantAdminRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    const input = screen.getByLabelText("Menu Item Name")
    await userEvent.type(input, "Special Macchiato")
    expect(input).toHaveValue("Special Macchiato")

    // Background role revalidation happens
    authState.roleLoading = true
    rerender(
      <MemoryRouter initialEntries={["/lemi-coffee/admin/menu"]}>
        <Routes>
          <Route
            path="/:cafeSlug/admin/menu"
            element={
              <TenantAdminRoute>
                <TestForm label="Menu Item Name" />
              </TenantAdminRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByLabelText("Menu Item Name")).toHaveValue("Special Macchiato")
  })

  it("RoleRoute preserves active form input when background roleLoading occurs", async () => {
    authState.user = { id: "barista-1", email: "barista@cafe.test" }
    authState.role = "barista"
    authState.cafeSlug = "lemi-coffee"
    authState.loading = false
    authState.roleLoading = false

    const { rerender } = render(
      <MemoryRouter initialEntries={["/lemi-coffee/kds"]}>
        <Routes>
          <Route
            path="/:cafeSlug/kds"
            element={
              <RoleRoute role="barista">
                <TestForm label="Kitchen Note" />
              </RoleRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    const input = screen.getByLabelText("Kitchen Note")
    await userEvent.type(input, "Extra oat milk")
    expect(input).toHaveValue("Extra oat milk")

    // Background role revalidation happens
    authState.roleLoading = true
    rerender(
      <MemoryRouter initialEntries={["/lemi-coffee/kds"]}>
        <Routes>
          <Route
            path="/:cafeSlug/kds"
            element={
              <RoleRoute role="barista">
                <TestForm label="Kitchen Note" />
              </RoleRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByLabelText("Kitchen Note")).toHaveValue("Extra oat milk")
  })

  it("TenantGuard does not unmount public customer menu/item modal on tab switch or background check", async () => {
    authState.user = null
    authState.role = null
    authState.loading = false
    authState.roleLoading = false
    tenantMock.currentStatus = "ready"

    const { rerender } = render(
      <MemoryRouter initialEntries={["/lemi-coffee/menu"]}>
        <Routes>
          <Route
            path="/:cafeSlug/menu"
            element={
              <TenantGuard>
                <TestForm label="Customer Item Notes" />
              </TenantGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    const input = screen.getByLabelText("Customer Item Notes")
    await userEvent.type(input, "No sugar, extra ice")
    expect(input).toHaveValue("No sugar, extra ice")

    // Customer switches tab and returns: simulate transient network glitch / background re-check
    tenantMock.currentStatus = "unavailable"
    rerender(
      <MemoryRouter initialEntries={["/lemi-coffee/menu"]}>
        <Routes>
          <Route
            path="/:cafeSlug/menu"
            element={
              <TenantGuard>
                <TestForm label="Customer Item Notes" />
              </TenantGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    // Form must remain intact without reloading or showing error
    expect(screen.getByLabelText("Customer Item Notes")).toHaveValue("No sugar, extra ice")
  })

  it("PlanRoute does not unmount staff screen when subscription revalidates in background", async () => {
    planState.subscriptionStatus = "active"

    const { rerender } = render(
      <MemoryRouter initialEntries={["/lemi-coffee/kds"]}>
        <Routes>
          <Route
            path="/:cafeSlug/kds"
            element={
              <PlanRoute feature="kds">
                <TestForm label="Order Search" />
              </PlanRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    const input = screen.getByLabelText("Order Search")
    await userEvent.type(input, "Table 5")
    expect(input).toHaveValue("Table 5")

    // Tab switch triggers background plan loading
    planState.subscriptionStatus = "loading"
    rerender(
      <MemoryRouter initialEntries={["/lemi-coffee/kds"]}>
        <Routes>
          <Route
            path="/:cafeSlug/kds"
            element={
              <PlanRoute feature="kds">
                <TestForm label="Order Search" />
              </PlanRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    // Form input must remain intact
    expect(screen.getByLabelText("Order Search")).toHaveValue("Table 5")
  })
})
