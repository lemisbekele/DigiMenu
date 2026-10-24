// Kitchen queue: open orders in arrival order; the first `capacity` count as preparing.
// Keep the wait formula in step with cafe_private.order_queue (migration 20261025000000).
export const OPEN_STATUSES = ["received", "accepted", "preparing"]
export const DEFAULT_KITCHEN_CAPACITY = 2

const prepMinutes = (order) => Number(order.estimatedReadyMinutes) || 15
const createdMs = (order) => Number(order.createdAtMs) || new Date(order.createdAt || 0).getTime()

// Returns Map(orderId -> { position, preparing, waitMinutes }) for open orders only.
export function kitchenQueue(orders, capacity = DEFAULT_KITCHEN_CAPACITY) {
  const cap = Math.max(1, Number(capacity) || DEFAULT_KITCHEN_CAPACITY)
  const open = orders
    .filter((o) => OPEN_STATUSES.includes(o.orderStatus))
    .sort((a, b) => createdMs(a) - createdMs(b) || String(a.id).localeCompare(String(b.id)))
  const queue = new Map()
  let aheadMinutes = 0
  open.forEach((order, position) => {
    const own = prepMinutes(order)
    const preparing = position < cap
    queue.set(order.id, { position, preparing, waitMinutes: preparing ? own : Math.ceil(aheadMinutes / cap) + own })
    aheadMinutes += own
  })
  return queue
}

// Status to show staff: "preparing" or "in line #k" for open orders, the stored status otherwise.
export function queueStatus(order, queue) {
  const q = queue.get(order.id)
  if (!q) return order.orderStatus
  return q.preparing ? "preparing" : `in line #${q.position + 1}`
}
