import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AdminOrders } from "./AdminOrders"

const mocks = vi.hoisted(() => ({
  updateStaffOrder: vi.fn(() => Promise.resolve()),
}))

vi.mock("../context/rbacContextValue", () => ({
  useRBAC: () => ({
    role: "admin",
    email: "admin@cafe.local",
    can: () => true,
    canAny: () => true,
  }),
}))

vi.mock("../services/dataService", () => ({
  formatCustomizations: vi.fn(() => ""),
  formatIngredientSelections: vi.fn((item) => `Ingredients: ${(item.ingredients || []).join(", ") || "None"}`),
  money: vi.fn((value) => `ETB ${Number(value || 0).toFixed(2)}`),
  observeOrders: vi.fn((callback) => {
    callback([
      {
        id: "ORD-1",
        createdAtMs: Date.parse("2026-07-06T10:00:00Z"),
        estimatedReadyMinutes: 12,
        items: [{ name: "Macchiato", ingredients: ["Coffee"], quantity: 2 }],
        orderStatus: "received",
        paymentStatus: "unpaid",
        tableNumber: 4,
        totalAmount: 552,
      },
      {
        id: "ORD-2",
        createdAtMs: Date.parse("2026-07-06T10:05:00Z"),
        items: [{ name: "Tea", quantity: 1 }],
        orderStatus: "rejected",
        paymentStatus: "rejected",
        tableNumber: 9,
        totalAmount: 40,
      },
    ])
    return vi.fn()
  }),
  updateStaffOrder: mocks.updateStaffOrder,
  writeAuditLog: vi.fn(() => Promise.resolve()),
  observePaymentOptions: vi.fn((callback) => {
    callback([])
    return vi.fn()
  }),
}))

vi.mock("../services/notificationService", () => ({
  notifyOrderEvent: vi.fn(),
  NOTIFICATION_EVENTS: {},
}))

vi.mock("../components/NotificationSettings", () => ({
  NotificationSettings: () => <div data-testid="notifications" />,
}))

vi.mock("../components/NotificationCenter", () => ({
  NotificationCenter: () => <div data-testid="notification-center" />,
}))

describe("AdminOrders", () => {
  beforeEach(() => {
    mocks.updateStaffOrder.mockClear()
  })

  it("searches active orders by item and table number", async () => {
    const user = userEvent.setup()
    render(<AdminOrders />)

    expect(screen.getByText("Table 4")).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText("Table, item, status, order ID"), "macchiato")

    expect(screen.getByText("Table 4")).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText("Table, item, status, order ID"))
    await user.type(screen.getByPlaceholderText("Table, item, status, order ID"), "nonexistent")

    expect(screen.queryByText("Table 4")).not.toBeInTheDocument()
  })

  it("rejects orders and disables auto-ready controls on rejected orders", async () => {
    const user = userEvent.setup()
    render(<AdminOrders />)

    await user.click(screen.getByText("Reject"))
    await user.click(screen.getByRole("button", { name: "Reject Order" }))
    expect(mocks.updateStaffOrder).toHaveBeenCalledWith("ORD-1", expect.objectContaining({
      autoReadyAt: null,
      orderStatus: "rejected",
    }))
  })
})
