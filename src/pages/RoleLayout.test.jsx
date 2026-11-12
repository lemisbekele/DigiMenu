import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { RoleLayout } from "./RoleLayout"

const state = vi.hoisted(() => ({ role: "admin" }))
vi.mock("../context/authContextValue", () => ({ useAuth: () => ({ logout: () => {} }) }))
vi.mock("../context/rbacContextValue", () => ({ useRBAC: () => ({ role: state.role, email: "someone@lemi.test", can: () => true, canAny: () => true }) }))
vi.mock("../context/planContextValue", () => ({ usePlan: () => ({ hasFeature: () => true }) }))
vi.mock("../components/NotificationCenter", () => ({ NotificationCenter: () => null }))
vi.mock("../components/LanguageToggle", () => ({ LanguageToggle: () => null }))
vi.mock("../components/ForcePasswordChangeModal", () => ({ ForcePasswordChangeModal: () => null }))

function show(role, path = "/lemi-coffee/orders") {
  state.role = role
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/:cafeSlug/*" element={<RoleLayout><p>Page</p></RoleLayout>} /><Route path="/superadmin/*" element={<RoleLayout><p>Page</p></RoleLayout>} /></Routes></MemoryRouter>)
}

describe("page frame navigation", () => {
  it("groups an admin's links under Service and Manage", () => {
    show("admin")
    expect(within(screen.getByRole("group", { name: "Service" })).getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/lemi-coffee/orders")
    expect(within(screen.getByRole("group", { name: "Manage" })).getByRole("link", { name: "Settings" })).toBeInTheDocument()
  })

  it("puts the barista's kitchen link under Service", () => {
    show("barista")
    expect(within(screen.getByRole("group", { name: "Service" })).getByRole("link", { name: "Kitchen" })).toBeInTheDocument()
  })

  it("gives the superadmin Platform and Manage groups", () => {
    show("superadmin", "/superadmin/cafes")
    expect(within(screen.getByRole("group", { name: "Platform" })).getByRole("link", { name: "Cafes" })).toHaveAttribute("href", "/superadmin/cafes")
    expect(within(screen.getByRole("group", { name: "Manage" })).getByRole("link", { name: "Audit Logs" })).toBeInTheDocument()
  })
})
