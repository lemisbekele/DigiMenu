import { describe, expect, it } from "vitest"
import { customerPaymentMethods } from "./dataService"

const cbe = { id: "1", type: "CBE", name: "CBE", active: true }

describe("customerPaymentMethods", () => {
  it("offers cash by default", () => {
    expect(customerPaymentMethods([cbe]).map((o) => o.type)).toEqual(["Cash", "CBE"])
  })
  it("drops cash once the cafe turned it off", () => {
    expect(customerPaymentMethods([cbe, { id: "2", type: "Cash", active: false }]).map((o) => o.type)).toEqual(["CBE"])
  })
  it("keeps the cafe's own cash option when it is on", () => {
    expect(customerPaymentMethods([{ id: "2", type: "Cash", active: true }]).map((o) => o.id)).toEqual(["2"])
  })
})
