import { describe, expect, it } from "vitest"
import { kitchenQueue, pendingStations, stationItems } from "./kitchenQueue"

describe("kitchen stations", () => {
  const mixed = { items: [{ name: "Latte" }, { name: "Burger" }] }
  it("keeps a mixed order open until both stations are done", () => {
    expect(pendingStations(mixed).sort()).toEqual(["drinks", "food"])
    expect(pendingStations({ ...mixed, doneStations: ["drinks"] })).toEqual(["food"])
    expect(pendingStations({ ...mixed, doneStations: ["drinks", "food"] })).toEqual([])
  })
  it("shows each station only its own items", () => {
    expect(stationItems(mixed, "drinks").map((i) => i.name)).toEqual(["Latte"])
    expect(stationItems(mixed, "food").map((i) => i.name)).toEqual(["Burger"])
    expect(stationItems(mixed, "all")).toHaveLength(2)
  })
})

const order = (id, createdAtMs, orderStatus = "received", estimatedReadyMinutes = 10) => ({ id, createdAtMs, orderStatus, estimatedReadyMinutes })

describe("kitchenQueue", () => {
  it("marks the oldest N open orders as preparing and moves the next one up when one is done", () => {
    const orders = [order("c", 3), order("a", 1), order("b", 2), order("x", 0, "ready")]
    let q = kitchenQueue(orders, 2)
    expect(q.has("x")).toBe(false)
    expect(q.get("a")).toEqual({ position: 0, preparing: true, waitMinutes: 10 })
    expect(q.get("b").preparing).toBe(true)
    // 20 minutes of work ahead shared by 2 cooks, plus its own 10.
    expect(q.get("c")).toEqual({ position: 2, preparing: false, waitMinutes: 20 })

    q = kitchenQueue([...orders.filter((o) => o.id !== "a"), order("a", 1, "ready")], 2)
    expect(q.get("c").preparing).toBe(true)
  })

  it("falls back to 15 minutes and capacity 2 when values are missing", () => {
    const q = kitchenQueue([order("a", 1, "received", 0), order("b", 2), order("c", 3)], undefined)
    expect(q.get("a").waitMinutes).toBe(15)
    expect(q.get("c").waitMinutes).toBe(Math.ceil(25 / 2) + 10)
  })
})
