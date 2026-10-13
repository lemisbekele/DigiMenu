const key = (slug) => `cafe-order-access:${slug}`

export function orderTokens(slug) {
  try { return JSON.parse(localStorage.getItem(key(slug)) || "{}") } catch { return {} }
}

export function saveOrderToken(slug, id, token) {
  const records = Object.entries({ ...orderTokens(slug), [id]: token }).slice(-50)
  localStorage.setItem(key(slug), JSON.stringify(Object.fromEntries(records)))
}

export function newOrderToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")
}
