import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { TenantGuard } from "./TenantGuard"

const state = vi.hoisted(() => ({ status: "not_found" }))
vi.mock("../context/authContextValue", () => ({ useAuth: () => ({ user: null, loading: false, roleLoading: false }) }))
vi.mock("../services/tenantAccessService", () => ({
  TENANT_ACCESS: { READY: "ready", NOT_FOUND: "not_found", UNAVAILABLE: "unavailable" },
  observeTenantAccess: (_, callback) => {
    callback({ status: state.status, error: { message: "Supabase private_table SQL secret" } })
    return () => {}
  },
}))

describe("tenant error screens", () => {
  function show(status) {
    state.status = status
    return render(<MemoryRouter initialEntries={["/missing-cafe/menu"]}><Routes><Route path="/:cafeSlug/menu" element={<TenantGuard><p>Private cafe content</p></TenantGuard>} /></Routes></MemoryRouter>)
  }

  it("offers recovery from a missing cafe without implementation details", () => {
    const { container } = show("not_found")
    expect(screen.getByRole("heading", { name: "Cafe Not Found" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/")
    expect(container.textContent).not.toMatch(/Supabase|SQL|private|secret/i)
  })

  it("distinguishes an unavailable service from a missing cafe, with retry", () => {
    const { container } = show("unavailable")
    expect(screen.getByRole("heading", { name: "Temporarily unavailable" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Supabase|SQL|private|secret/i)
  })
})
