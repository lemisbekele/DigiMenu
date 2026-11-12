import { describe, expect, it, vi } from "vitest"
vi.mock("../services/dataService", () => ({ money: (v) => String(v), observeOrders: () => () => {}, observeAuditLogs: () => () => {} }))
import { trendOf } from "./OwnerDashboard"

describe("dashboard trend wording", () => {
  it("compares against the previous period", () => {
    expect(trendOf(112, 100, "last Friday")).toEqual({ dir: "up", text: "Up 12% on last Friday" })
    expect(trendOf(90, 100, "last Friday")).toEqual({ dir: "down", text: "Down 10% on last Friday" })
  })
  it("never divides by zero", () => {
    expect(trendOf(0, 0, "last Friday")).toEqual({ dir: "flat", text: "Same as last Friday" })
    expect(trendOf(50, 0, "last Friday")).toEqual({ dir: "up", text: "New since last Friday" })
  })
})
