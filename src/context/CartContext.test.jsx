import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { CartProvider } from "./CartContext"
import { useCart } from "./cartContextValue"

function CartHarness() {
  const { addItem, itemCount, items, removeItemByItemId, subtotal, toggleItem } = useCart()
  const item = { itemId: "coffee", name: "Coffee", price: 100 }
  return (
    <div>
      <span data-testid="count">{itemCount}</span>
      <span data-testid="subtotal">{subtotal}</span>
      <span data-testid="items">{items.map((entry) => entry.itemId).join(",")}</span>
      <button type="button" onClick={() => addItem(item)}>Add</button>
      <button type="button" onClick={() => toggleItem(item)}>Toggle</button>
      <button type="button" onClick={() => removeItemByItemId(item.itemId)}>Remove</button>
    </div>
  )
}

describe("CartContext", () => {
  beforeEach(() => localStorage.clear())

  it("restores a recent cart after the page is reopened, but not an old one", () => {
    const key = `cafe-cart:${window.location.pathname.split("/").filter(Boolean)[0] || ""}`
    const saved = [{ itemId: "coffee", cartId: "coffee", name: "Coffee", price: 100, quantity: 2 }]
    localStorage.setItem(key, JSON.stringify({ items: saved, savedAt: Date.now() - 60_000 }))
    const { unmount } = render(<CartProvider><CartHarness /></CartProvider>)
    expect(screen.getByTestId("count")).toHaveTextContent("2")
    unmount()

    localStorage.setItem(key, JSON.stringify({ items: saved, savedAt: Date.now() - 7 * 60 * 60 * 1000 }))
    render(<CartProvider><CartHarness /></CartProvider>)
    expect(screen.getByTestId("count")).toHaveTextContent("0")
  })

  it("prevents duplicate additions and updates immediately on removal", async () => {
    const user = userEvent.setup()
    render(
      <CartProvider>
        <CartHarness />
      </CartProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Add" }))
    await user.click(screen.getByRole("button", { name: "Add" }))

    expect(screen.getByTestId("count")).toHaveTextContent("1")
    expect(screen.getByTestId("subtotal")).toHaveTextContent("100")

    await user.click(screen.getByRole("button", { name: "Remove" }))
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(screen.getByTestId("items")).toHaveTextContent("")
  })
})

