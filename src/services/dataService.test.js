import { describe, expect, it } from "vitest"
import {
  calculateTotals,
  cartLineTotal,
  formatCustomizations,
  formatIngredientSelections,
  getLocalizedMenuLabel,
  money,
} from "./dataService"

describe("money and cart calculations", () => {
  it("formats Ethiopian birr consistently", () => {
    expect(money(552).replace(/\s/g, " ")).toBe("ETB 552.00")
    expect(money().replace(/\s/g, " ")).toBe("ETB 0.00")
  })

  it("includes selected option extras in line totals", () => {
    const item = {
      price: 100,
      quantity: 2,
      customizations: {
        Size: [{ name: "Large", extraPrice: 25 }],
        Ingredients: [{ name: "Milk", extraPrice: 0 }],
      },
    }
    expect(cartLineTotal(item)).toBe(250)
  })

  it("calculates subtotal, discount, tax, and final total accurately", () => {
    const totals = calculateTotals(
      [
        { price: 100, quantity: 2, customizations: { Size: [{ name: "Large", extraPrice: 25 }] } },
        { price: 50, quantity: 1 },
      ],
      { discountAmount: 30, taxRate: 15 },
    )
    expect(totals).toEqual({
      discountAmount: 30,
      subtotalAmount: 300,
      taxableAmount: 270,
      taxAmount: 40.5,
      taxRate: 15,
      totalAmount: 310.5,
    })
  })
})

describe("formatters and i18n fallbacks", () => {
  it("formats ingredient selections with removed ingredients", () => {
    const item = {
      ingredients: ["Coffee", "Milk", "Sugar"],
      customizations: { Ingredients: [{ name: "Coffee" }, { name: "Milk" }] },
    }
    expect(formatIngredientSelections(item)).toBe("Ingredients: Coffee, Milk · Removed: Sugar")
  })

  it("formats option customizations without ingredient noise", () => {
    const customizations = {
      Ingredients: [{ name: "Coffee" }],
      Size: [{ name: "Large" }],
      Toppings: [],
    }
    expect(formatCustomizations(customizations)).toBe("Size: Large · Toppings: None")
  })

  it("uses source labels when no i18next translation exists", () => {
    expect(getLocalizedMenuLabel("categories", "Hot Drinks", "am")).toBe("Hot Drinks")
  })
})

