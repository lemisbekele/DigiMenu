import { describe, expect, it } from "vitest"
import { isOrderReady, newOrderIds } from "./kitchenAlerts"

describe("newOrderIds", () => {
  it("finds a new order even when the kitchen was empty or another order just left", () => {
    expect(newOrderIds(new Set(), [{ id: "a", orderStatus: "received" }])).toEqual(["a"])
    // "b" went out and "c" came in during the same refresh: the count is unchanged, but "c" is new.
    expect(newOrderIds(new Set(["a", "b"]), [{ id: "a", orderStatus: "preparing" }, { id: "c", orderStatus: "received" }])).toEqual(["c"])
    expect(newOrderIds(new Set(["a"]), [{ id: "a", orderStatus: "received" }])).toEqual([])
  })
})

describe("isOrderReady", () => {
  it("treats a prepaid order that closed on ready as ready", () => {
    expect(isOrderReady({ orderStatus: "ready" })).toBe(true)
    expect(isOrderReady({ orderStatus: "paid", readyAtMs: 1 })).toBe(true)
    expect(isOrderReady({ orderStatus: "paid" })).toBe(false)
    expect(isOrderReady({ orderStatus: "preparing" })).toBe(false)
    expect(isOrderReady(null)).toBe(false)
  })
})
