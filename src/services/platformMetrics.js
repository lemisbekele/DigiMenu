export function requestTrend(requests, now = new Date(), locale) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleDateString(locale, { month: "short" }), value: 0 }
  })
  for (const request of requests) {
    const value = request.requested_at || request.created_at || request.createdAtMs
    if (value == null) continue
    const date = new Date(value)
    if (!Number.isFinite(date.getTime()) || date > now) continue
    const month = months.find(item => item.key === `${date.getFullYear()}-${date.getMonth()}`)
    if (month) month.value++
  }
  return months
}

export function cafeDistribution(cafes) {
  return [
    { key: "active", label: "Active", color: "var(--brand)", value: cafes.filter(c => c.status === "active").length },
    { key: "suspended", label: "Suspended", color: "var(--warning)", value: cafes.filter(c => c.status === "suspended").length },
    { key: "other", label: "Other statuses", color: "var(--muted)", value: cafes.filter(c => !["active", "suspended"].includes(c.status)).length },
  ]
}
