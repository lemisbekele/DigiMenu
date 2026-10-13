import { describe, expect, it } from "vitest"
import { resources } from "../i18n"

describe("Place Order & Cash Workflow", () => {
  it("defines placeOrder translations across all languages", () => {
    expect(resources.en.translation.placeOrder).toBe("Place Order")
    expect(resources.am.translation.placeOrder).toBe("ትዕዛዝ አስገባ")
    expect(resources.om.translation.placeOrder).toBe("Ajaja Ergi")
  })

  it("ensures payAndPlaceOrder falls back to Place Order", () => {
    expect(resources.en.translation.payAndPlaceOrder).toBe("Place Order")
    expect(resources.am.translation.payAndPlaceOrder).toBe("ትዕዛዝ አስገባ")
    expect(resources.om.translation.payAndPlaceOrder).toBe("Ajaja Ergi")
  })
})
