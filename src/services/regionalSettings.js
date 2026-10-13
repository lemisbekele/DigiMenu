import { supabase } from "./supabase"
import i18n from "../i18n"

export const DEFAULT_REGION = Object.freeze({ currency: "ETB", timeZone: "Africa/Addis_Ababa" })
export const CURRENCIES = ["ETB","USD","EUR","GBP","KES","UGX","TZS","ZAR","NGN","GHS","AED","SAR","INR","AUD","CAD","CHF","SGD","NZD","CNY","BRL","MXN"]
const cache = new Map()
const pending = new Map()
export function currentRegion() {
  const slug = typeof window === "undefined" ? "" : window.location.pathname.split("/")[1]
  return cache.get(slug)?.value || DEFAULT_REGION
}
export async function fetchCafeRegion(slug, force = false) {
  if (!force && cache.has(slug) && Date.now() - cache.get(slug).at < 30000) return cache.get(slug).value
  if (pending.has(slug)) return pending.get(slug)
  const promise = (async () => {
    const { data, error } = await supabase.rpc("get_cafe_region", { p_cafe_slug: slug })
    if (error) throw new Error("Regional settings could not load. Please try again.")
    const row = data?.[0]
    const value = row ? { currency: row.currency, timeZone: row.time_zone } : DEFAULT_REGION
    cache.set(slug, { value, at: Date.now() })
    if (cache.size > 50) cache.delete(cache.keys().next().value)
    return value
  })().finally(() => pending.delete(slug))
  pending.set(slug, promise)
  return promise
}
export async function saveCafeRegion(slug, region) {
  const { error } = await supabase.rpc("set_cafe_region", { p_cafe_slug: slug, p_currency: region.currency, p_time_zone: region.timeZone })
  if (error) throw new Error(error.code === "P0001" ? error.message : "Regional settings could not be saved.")
  await fetchCafeRegion(slug, true)
  window.dispatchEvent(new Event("cafe-region-updated"))
}
export function formatMoney(value, currency = currentRegion().currency, locale = i18n.resolvedLanguage || "en") {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0)
}
export function formatDateTime(value, options = {}) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", { timeZone: currentRegion().timeZone, dateStyle: "medium", timeStyle: "short", ...options }).format(date)
}
export function dateKey(value, timeZone = currentRegion().timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value))
  const part = type => parts.find(p => p.type === type).value
  return `${part("year")}-${part("month")}-${part("day")}`
}
// Convert a cafe-local calendar date to a UTC boundary, including DST changes.
export function zonedMidnight(key, timeZone = currentRegion().timeZone) {
  const desired = Date.parse(`${key}T00:00:00Z`)
  let result = desired
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(result)).map(p => [p.type,p.value]))
    const represented = Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second))
    const delta = desired - represented
    result += delta
    if (!delta) break
  }
  return new Date(result)
}
