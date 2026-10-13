import { describe, expect, it } from "vitest"
import { cafeDistribution, requestTrend } from "./platformMetrics"

describe("platform charts", () => {
  it("counts requests across year boundaries, fills empty months, and excludes invalid or future dates", () => {
    const now = new Date(2026, 1, 10, 12)
    const rows = [
      { requested_at: new Date(2025, 8, 1) },
      { created_at: new Date(2025, 11, 20) },
      { createdAtMs: new Date(2026, 1, 1).getTime() },
      { requested_at: new Date(2025, 7, 31) },
      { requested_at: new Date(2026, 1, 20) },
      { requested_at: "invalid" }, {},
    ]
    const result = requestTrend(rows, now, "en-US")
    expect(result.map(item => item.label)).toEqual(["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"])
    expect(result.map(item => item.value)).toEqual([1, 0, 0, 1, 0, 1])
  })

  it("includes unknown cafe statuses without counting them as active", () => {
    const result = cafeDistribution([{ status: "active" }, { status: "suspended" }, { status: "pending" }, {}])
    expect(result.map(item => item.value)).toEqual([1, 1, 2])
    expect(cafeDistribution([]).every(item => item.value === 0)).toBe(true)
  })
})
