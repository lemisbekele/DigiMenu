const storageKey = () => `cafe_order_history_v2:${window.location.pathname.split('/').filter(Boolean)[0]?.toLowerCase() || ''}`
const MAX_RECORDS = 50

export function readOrderRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) || "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveOrderRecord(order) {
  try {
    const list = readOrderRecords()
    const index = list.findIndex((record) => record.id === order.id)
    const record = {
      id: order.id,
      placedAt: order.placedAt || Date.now(),
      tableNumber: order.tableNumber,
      subtotalAmount: Number(order.subtotalAmount) || 0,
      taxAmount: Number(order.taxAmount) || 0,
      totalAmount: Number(order.totalAmount) || 0,
      estimatedMinutes: Number(order.estimatedReadyMinutes) || 15,
      items: Array.isArray(order.items) ? order.items : [],
    }
    if (index >= 0) {
      list[index] = { ...list[index], ...record }
    } else {
      list.unshift(record)
    }
    localStorage.setItem(storageKey(), JSON.stringify(list.slice(0, MAX_RECORDS)))
  } catch {
    // localStorage unavailable; ignore
  }
}
