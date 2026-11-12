// The five states every screen uses (docs/design-language.html). Anything unrecognised reads as waiting.
const TONES = {
  waiting: ["received", "accepted", "pending", "unpaid", "inactive", "draft", "scheduled", "waiting"],
  preparing: ["preparing", "in_progress", "processing"],
  ready: ["ready", "active", "approved", "served", "granted", "ok"],
  late: ["late", "rejected", "cancelled", "canceled", "suspended", "expired", "denied", "failed", "out", "low"],
  paid: ["paid", "completed", "confirmed"],
}
const TONE_BY_STATUS = Object.fromEntries(Object.entries(TONES).flatMap(([tone, list]) => list.map((s) => [s, tone])))

export function toneForStatus(status) {
  return TONE_BY_STATUS[String(status || "").toLowerCase()] || "waiting"
}

export function StatusPill({ tone, children }) {
  return <span className="ui-pill" data-tone={TONES[tone] ? tone : "waiting"}>{children}</span>
}
