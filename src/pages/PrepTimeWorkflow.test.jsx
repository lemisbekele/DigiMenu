import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AdminMenu } from "./AdminMenu"
import { saveMenuItem } from "../services/dataService"

const mocks = vi.hoisted(() => ({
  useRBAC: vi.fn(),
  updateStaffOrder: vi.fn(() => Promise.resolve()),
  writeAuditLog: vi.fn(() => Promise.resolve()),
}))

vi.mock("../context/rbacContextValue", () => ({
  useRBAC: () => mocks.useRBAC(),
}))

vi.mock("../services/dataService", () => ({
  deleteMenuItem: vi.fn(),
  money: (val) => `ETB ${val}`,
  observeMenuItems: (cb) => {
    cb([
      {
        id: "item-1",
        name: "Espresso",
        category: "Coffee",
        price: 0,
        estimatedMinutes: 5,
        available: true,
      },
    ])
    return () => {}
  },
  saveMenuItem: vi.fn(() => Promise.resolve()),
  updateMenuAvailability: vi.fn(),
  updateStaffOrder: mocks.updateStaffOrder,
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock("../context/languageContextValue", () => ({
  useLanguage: () => ({
    t: (key) => key,
  }),
}))

describe("Prep Time Workflow & Manager RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("saves ingredients entered on separate lines or separated by commas", async () => {
    mocks.useRBAC.mockReturnValue({ role: "manager" })
    const user = userEvent.setup()
    render(<AdminMenu />)
    await user.click(screen.getByLabelText("editItem"))
    await user.type(screen.getByPlaceholderText("Briefly describe flavour, ingredients, or serving style"), "Coffee with milk")
    await user.type(screen.getByPlaceholderText("e.g. 250"), "50")
    await user.type(screen.getByLabelText(/ingredientsLabel/), "Coffee\nMilk, Cocoa\n")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(saveMenuItem).toHaveBeenCalled())
    expect(saveMenuItem.mock.calls[0][0].ingredients).toEqual(["Coffee", "Milk", "Cocoa"])
    expect(saveMenuItem.mock.calls[0][0].price).toBe(0)
  })

  it("renders prep time field on edit form for Manager RBAC users", async () => {
    mocks.useRBAC.mockReturnValue({ role: "manager" })
    const user = userEvent.setup()

    render(<AdminMenu />)

    const editBtn = screen.getByLabelText("editItem")
    await user.click(editBtn)

    expect(screen.getByText("Prep time")).toBeInTheDocument()
  })

  it("hides prep time field on edit form for non-Manager RBAC users", async () => {
    mocks.useRBAC.mockReturnValue({ role: "cashier" })
    const user = userEvent.setup()

    render(<AdminMenu />)

    const editBtn = screen.getByLabelText("editItem")
    await user.click(editBtn)

    expect(screen.queryByText("Prep time")).not.toBeInTheDocument()
  })
})
