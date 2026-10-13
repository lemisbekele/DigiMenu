import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
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

