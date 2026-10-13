import { describe, expect, it } from "vitest"
import { buildReport, buildSalesCsv, orderItems, reportRange, csvEscape } from "./reporting"

const orders = [
  {
    id: "ORD-1",
    orderStatus: "paid",
    paymentStatus: "paid",
    paidAt: "2026-07-06T08:00:00.000Z",
    tableNumber: 1,
    totalAmount: 552,
    items: [
      { name: "Coffee", price: 100, quantity: 2 },
      { name: "Cake", price: 352, quantity: 1 },
    ],
  },
  {
    id: "ORD-2",
    orderStatus: "paid",
    paymentStatus: "paid",
    paidAt: "2026-07-06T09:00:00.000Z",
    tableNumber: 2,
    totalAmount: 300,
    items: [{ name: "Coffee", price: 100, quantity: 3 }],
  },
  {
    id: "ORD-3",
    orderStatus: "preparing",
    paymentStatus: "unpaid",
    tableNumber: 1,
    totalAmount: 999,
    items: [{ name: "Tea", price: 999, quantity: 1 }],
  },
]

describe("sales reporting", () => {
  it("neutralizes spreadsheet formulas in untrusted exported text", () => {
    expect(csvEscape('=HYPERLINK("https://example.test")')).toBe('"\'=HYPERLINK(""https://example.test"")"')
    expect(csvEscape('@SUM(1,2)')).toBe('"\'@SUM(1,2)"')
    expect(csvEscape(-25)).toBe('"-25"')
  })
  it("builds accurate completed-order sales metrics", () => {
    const range = {
      from: new Date("2026-07-06T00:00:00.000Z"),
      to: new Date("2026-07-07T00:00:00.000Z"),
    }
    const report = buildReport(orders, range, "")
    expect(report.totalOrders).toBe(2)
    expect(report.totalRevenue).toBe(852)
    expect(report.averageOrderValue).toBe(426)
    expect(report.itemCounts[0]).toEqual(["Coffee", { count: 5, revenue: 500 }])
    expect(report.tableCounts).toEqual(expect.arrayContaining([[1, 1], [2, 1]]))
  })

  it("filters report records by search", () => {
    const range = {
      from: new Date("2026-07-06T00:00:00.000Z"),
      to: new Date("2026-07-07T00:00:00.000Z"),
    }
    const report = buildReport(orders, range, "cake")
    expect(report.totalOrders).toBe(1)
    expect(report.completedOrders[0].id).toBe("ORD-1")
  })

  it("creates monthly and custom ranges", () => {
    const now = new Date("2026-07-06T12:00:00.000Z")
    expect(reportRange("monthly", "", "", now).from.toISOString()).toBe(new Date(2026, 6, 1).toISOString())
    expect(reportRange("custom", "2026-07-02", "2026-07-03", now).to.toISOString()).toBe(new Date(2026, 6, 4).toISOString())
  })

  it("exports CSV values matching displayed calculations", () => {
    const range = {
      from: new Date("2026-07-06T00:00:00.000Z"),
      to: new Date("2026-07-07T00:00:00.000Z"),
    }
    const report = buildReport(orders, range, "")
    const csv = buildSalesCsv(report, "7/6/2026 - 7/6/2026")
    expect(csv).toContain('"Completed orders","2"')
    expect(csv).toContain('"Total revenue","852.00"')
    expect(csv).toContain('"Average order value","426.00"')
    expect(csv).toContain(`"ORD-1","1","${orderItems(orders[0])}","0","552.00"`)
  })
})

