import { currentRegion, dateKey, zonedMidnight, formatDateTime } from "./regionalSettings"

export const REPORT_TYPES = ["daily", "weekly", "monthly", "quarterly", "yearly", "custom"]

export function orderCompletedAt(order) {
  if (order.paidAt) return new Date(order.paidAt)
  if (order.readyAt) return new Date(order.readyAt)
  if (order.updatedAt?.toDate) return order.updatedAt.toDate()
  if (order.createdAt?.toDate) return order.createdAt.toDate()
  if (order.createdAtMs) return new Date(order.createdAtMs)
  return new Date(order.createdAt || Date.now())
}

export function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function reportRange(type, customFrom, customTo, now = new Date(), timeZone = currentRegion().timeZone) {
  const today = dateKey(now, timeZone)
  const shift = (key, days) => new Date(Date.parse(`${key}T12:00:00Z`) + days * 86400000).toISOString().slice(0,10)
  const end = zonedMidnight(shift(today, 1), timeZone)
  const [year, month] = today.split("-")
  const from = type === "daily" ? today : type === "weekly" ? shift(today, -6) : type === "monthly" ? `${year}-${month}-01`
    : type === "quarterly" ? `${year}-${String(Math.floor((Number(month)-1)/3)*3+1).padStart(2,"0")}-01`
    : type === "yearly" ? `${year}-01-01` : customFrom
  return { from: from ? zonedMidnight(from, timeZone) : new Date(0), to: type === "custom" && customTo ? zonedMidnight(shift(customTo,1), timeZone) : end }
}

export function csvEscape(value) {
  const text = String(value ?? "")
  const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function orderItems(order) {
  return (order.items || []).map((item) => `${item.quantity} x ${item.name}`).join("; ")
}

export function orderCalories(order) {
  return (order.items || []).reduce(
    (sum, item) => sum + Math.round(Number(item.calories || 0) * Number(item.quantity || 1)),
    0,
  )
}

export function buildReport(orders, range, search = "") {
  const needle = search.trim().toLowerCase()
  const completedOrders = orders
    .filter((order) => order.paymentStatus === "paid" || order.orderStatus === "paid")
    .filter((order) => {
      const completedAt = orderCompletedAt(order)
      const haystack = [order.id, order.tableNumber, orderItems(order), order.totalAmount, orderCalories(order)].join(" ").toLowerCase()
      return completedAt >= range.from && completedAt < range.to && (!needle || haystack.includes(needle))
    })
    .sort((a, b) => orderCompletedAt(b) - orderCompletedAt(a))

  const totalRevenue = completedOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
  const totalCalories = completedOrders.reduce((sum, order) => sum + orderCalories(order), 0)
  const itemCounts = new Map()
  const tableCounts = new Map()
  const itemCalories = new Map()

  completedOrders.forEach((order) => {
    tableCounts.set(order.tableNumber, (tableCounts.get(order.tableNumber) || 0) + 1)
    ;(order.items || []).forEach((item) => {
      const current = itemCounts.get(item.name) || { count: 0, revenue: 0 }
      itemCounts.set(item.name, {
        count: current.count + Number(item.quantity || 1),
        revenue: current.revenue + Number(item.price || 0) * Number(item.quantity || 1),
      })
      itemCalories.set(item.name, (itemCalories.get(item.name) || 0) + Math.round(Number(item.calories || 0) * Number(item.quantity || 1)))
    })
  })

  let highestCalorieItem = null
  let lowestCalorieItem = null
  const calorieEntries = [...itemCalories.entries()].sort((a, b) => b[1] - a[1])
  if (calorieEntries.length) {
    highestCalorieItem = { name: calorieEntries[0][0], calories: calorieEntries[0][1] }
    lowestCalorieItem = { name: calorieEntries[calorieEntries.length - 1][0], calories: calorieEntries[calorieEntries.length - 1][1] }
  }

  return {
    averageCalories: completedOrders.length ? Math.round(totalCalories / completedOrders.length) : 0,
    averageOrderValue: completedOrders.length ? totalRevenue / completedOrders.length : 0,
    completedOrders,
    highestCalorieItem,
    itemCounts: [...itemCounts.entries()].sort((a, b) => b[1].count - a[1].count),
    lowestCalorieItem,
    tableCounts: [...tableCounts.entries()].sort((a, b) => b[1] - a[1]),
    totalCalories,
    totalOrders: completedOrders.length,
    totalRevenue,
  }
}

export function buildSalesCsv(report, rangeLabel) {
  const summaryRows = [
    ["Report", rangeLabel],
    ["Currency", currentRegion().currency],
    ["Time zone", currentRegion().timeZone],
    ["Completed orders", report.totalOrders],
    ["Total revenue", report.totalRevenue.toFixed(2)],
    ["Average order value", report.averageOrderValue.toFixed(2)],
    ["Total calories (kcal)", report.totalCalories],
    ["Average calories per order (kcal)", report.averageCalories],
    report.highestCalorieItem ? [`Highest calorie item (kcal)`, `${report.highestCalorieItem.name} (${report.highestCalorieItem.calories})`] : null,
    report.lowestCalorieItem ? [`Lowest calorie item (kcal)`, `${report.lowestCalorieItem.name} (${report.lowestCalorieItem.calories})`] : null,
    [],
    ["Completed At", "Order ID", "Table", "Items", "Calories (kcal)", "Total"],
  ].filter(Boolean)
  const orderRows = report.completedOrders.map((order) => [
    formatDateTime(orderCompletedAt(order)),
    order.id,
    order.tableNumber,
    orderItems(order),
    orderCalories(order),
    Number(order.totalAmount || 0).toFixed(2),
  ])
  return [...summaryRows, ...orderRows].map((row) => row.map(csvEscape).join(",")).join("\n")
}


// The last n calendar days up to todayKey (YYYY-MM-DD), oldest first, so charts show days with no sales too.
export function lastDays(n, todayKey) {
  return Array.from({ length: n }, (_, i) => {
    const key = new Date(Date.parse(`${todayKey}T12:00:00Z`) - (n - 1 - i) * 86400000).toISOString().slice(0, 10)
    return { key, label: new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }) }
  })
}
