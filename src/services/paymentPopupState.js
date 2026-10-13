export function hasBeenShown(orderId) {
  try { return sessionStorage.getItem(`payment-confirmed-${orderId}`) === "1" } catch { return false }
}
export function markShown(orderId) {
  try { sessionStorage.setItem(`payment-confirmed-${orderId}`, "1") } catch { /* Storage may be unavailable. */ }
}
