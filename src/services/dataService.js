import { toUserMessage } from "./userMessages"
import { supabase, customerStorageClient } from "./supabase"
import { newOrderToken, orderTokens, saveOrderToken } from "./orderAccess"
import i18n from "../i18n"
import { DEFAULT_BILLING_SETTINGS } from "./billingSettings"
import { optimizeImage, computeFileHash, generateResponsiveVariants, validateImage } from "./imageOptimizer"
import { assertPlanFeature } from "./planService"
import { formatMoney } from "./regionalSettings"
const uploadDeduplicationCache = new Map()

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

function currentCafeSlug() {
  if (typeof window === "undefined") return ""
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0] || ""
  return firstSegment && firstSegment !== "superadmin" && firstSegment !== "pricing" && firstSegment !== "portfolio"
    ? firstSegment.toLowerCase()
    : ""
}

function requireCurrentCafeSlug() {
  const slug = currentCafeSlug()
  if (!slug) throw new Error("A cafe URL is required for this operation.")
  return slug
}

const STORAGE_BUCKET = "cafe-assets"

// Billing settings are keyed PER CAFE ("billing_<slug>") so two cafes can
// keep different tax rates; "billing" remains the platform default row that
// new cafes inherit until they save their own.
export function billingSettingsId(cafeSlug) {
  const slug = String(cafeSlug || currentCafeSlug() || "").trim().toLowerCase()
  return slug ? `billing_${slug}` : "billing"
}

async function storageUpload(path, blob, contentType) {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, { contentType, upsert: true })
  if (error) throw new Error(`Image upload failed: ${error.message}`)
  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return urlData?.publicUrl || ""
}

function toCamelCase(value) {
  if (Array.isArray(value)) return value.map(toCamelCase)
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        toCamelCase(v),
      ]),
    )
  }
  return value
}

function toSnakeCase(value) {
  if (Array.isArray(value)) return value.map(toSnakeCase)
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        toSnakeCase(v),
      ]),
    )
  }
  return value
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined).filter((entry) => entry !== undefined)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)])
        .filter(([, entry]) => entry !== undefined),
    )
  }
  return value
}

function cleanText(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength)
}

function assertFiniteNumber(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} is invalid.`)
  }
  return number
}

function assertWholeNumber(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = assertFiniteNumber(value, label, { min, max })
  if (!Number.isInteger(number)) {
    throw new Error(`${label} must be a whole number.`)
  }
  return number
}

function sanitizePaymentOption(option) {
  return {
    ...option,
    accountHolder: cleanText(option.accountHolder, 120),
    accountNumber: cleanText(option.accountNumber, 80),
    active: Boolean(option.active),
    instructions: cleanText(option.instructions, 500),
    name: cleanText(option.name, 120),
    type: cleanText(option.type, 80),
  }
}

function sanitizeMenuItem(item) {
  return {
    ...item,
    available: Boolean(item.available),
    calories: assertWholeNumber(item.calories || 0, "Calories", { max: 100000 }),
    category: cleanText(item.category, 80),
    description: cleanText(item.description, 1000),
    nameAm: cleanText(item.nameAm, 120),
    descriptionAm: cleanText(item.descriptionAm, 1000),
    nameOm: cleanText(item.nameOm, 120),
    descriptionOm: cleanText(item.descriptionOm, 1000),
    estimatedMinutes: assertFiniteNumber(item.estimatedMinutes || 0, "Estimated minutes", { max: 1440 }),
    imageUrl: cleanText(item.imageUrl, 1000),
    ingredients: (item.ingredients || []).map((ingredient) => cleanText(ingredient, 120)).filter(Boolean).slice(0, 50),
    name: cleanText(item.name, 120),
    options: (item.options || []).slice(0, 20).map((option) => ({
      label: cleanText(option.label, 80),
      choices: (option.choices || []).slice(0, 50).map((choice) => ({
        name: cleanText(choice.name, 120),
        extraPrice: assertFiniteNumber(choice.extraPrice || 0, "Option price", { max: 100000 }),
      })),
    })),
    price: assertFiniteNumber(item.price, "Price", { max: 1000000 }),
    subcategory: cleanText(item.subcategory, 80),
  }
}

let observeTableSeq = 0

function observeTable(tableName, queryFn, callback, onError) {
  let cancelled = false
  let channel = null
  const slug = currentCafeSlug()
  let generation = 0

  const fetch = async () => {
    const request = ++generation
    try {
      let query = supabase.from(tableName).select("*")
      if (slug) query = query.eq("cafe_slug", slug)
      if (queryFn) query = queryFn(query)
      const { data, error } = await query
      if (error) throw error
      if (!cancelled && request === generation) callback(toCamelCase(data || []))
    } catch (err) {
      if (!cancelled) onError?.(toUserMessage(err, "We couldn’t load this information. Please try again."))
    }
  }

  let debounceTimer = null
  const debouncedFetch = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (!cancelled) fetch()
    }, 100)
  }

  fetch()

  try {
    channel = supabase.channel(`${tableName}-${Date.now()}-${observeTableSeq++}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tableName, ...(slug ? { filter: `cafe_slug=eq.${slug}` } : {}) }, debouncedFetch)
      .subscribe()
  } catch {}

  return () => {
    cancelled = true
    if (debounceTimer) clearTimeout(debounceTimer)
    if (channel) supabase.removeChannel(channel).catch?.(() => {})
  }
}

export async function writeAuditLog(action, details = {}) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData?.session?.user) return
    const { error } = await supabase.rpc("record_client_audit", { p_action: action, p_details: details })
    if (error) {
      if (import.meta.env.DEV) console.warn(`Audit log could not be written: ${error.message || "unknown Supabase error"}`)
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn(`Audit log could not be written: ${error?.message || "unknown Supabase error"}`)
  }
}

export async function recordAuditLog(action, details = {}) {
  return writeAuditLog(action, details)
}

export function observeAuditLogs(callback, onError) {
  return observeTable(
    "audit_logs",
    (q) => q.order("created_at_ms", { ascending: false }),
    callback,
    onError,
  )
}

export function money(value, currency) {
  return formatMoney(value, currency)
}

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

export function selectedExtrasTotal(customizations = {}) {
  return Object.values(customizations).reduce((sum, selection) => {
    const choices = Array.isArray(selection) ? selection : selection ? [selection] : []
    return sum + choices.reduce((choiceSum, choice) => choiceSum + Number(choice.extraPrice || 0), 0)
  }, 0)
}

export function formatCustomizations(customizations = {}, noneLabel = "None", labelMap = {}) {
  const lines = Object.entries(customizations)
    .filter(([label]) => label !== "Ingredients")
    .map(([label, selection]) => {
      const choices = Array.isArray(selection) ? selection : selection ? [selection] : []
      return `${labelMap[label] || label}: ${choices.length ? choices.map((choice) => choice.name).join(", ") : noneLabel}`
    })
  return lines.join(" · ")
}

export function ingredientSelectionDetails(item) {
  const allIngredients = item.ingredients || []
  const selectedIngredients = (item.customizations?.Ingredients || []).map((entry) => entry.name)
  const removedIngredients = allIngredients.filter((ingredient) => !selectedIngredients.includes(ingredient))
  return { allIngredients, selectedIngredients, removedIngredients }
}

export function formatIngredientSelections(item, ingredientsLabel = "Ingredients", removedLabel = "Removed") {
  const { allIngredients, selectedIngredients, removedIngredients } = ingredientSelectionDetails(item)
  if (!allIngredients.length) return `${ingredientsLabel}: None`
  return `${ingredientsLabel}: ${selectedIngredients.length ? selectedIngredients.join(", ") : "None"}${
    removedIngredients.length ? ` · ${removedLabel}: ${removedIngredients.join(", ")}` : ""
  }`
}

export function getLocalizedItem(item, language) {
  const itemKey = String(item.id || item.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
  const localeName = language === "am" && item.nameAm ? item.nameAm : language === "om" && item.nameOm ? item.nameOm : ""
  const localeDescription = language === "am" && item.descriptionAm ? item.descriptionAm : language === "om" && item.descriptionOm ? item.descriptionOm : ""
  return {
    ...item,
    displayName: localeName || i18n.t(`menu.items.${itemKey}.name`, { defaultValue: item.name, lng: language }),
    displayDescription: localeDescription || i18n.t(`menu.items.${itemKey}.description`, { defaultValue: item.description, lng: language }),
  }
}

export function cartLineTotal(item) {
  return roundMoney((Number(item.price || 0) + selectedExtrasTotal(item.customizations)) * Number(item.quantity || 1))
}

export function cartLineCalories(item) {
  return Math.round(Number(item.calories || 0) * Number(item.quantity || 1))
}

export function totalCalories(items = []) {
  return items.reduce((sum, item) => sum + cartLineCalories(item), 0)
}

export function caloriesLabel(calories) {
  return `${Math.round(Number(calories || 0))} kcal`
}

export function calculateTotals(items = [], { taxRate = 0, discountAmount = 0 } = {}) {
  const subtotalAmount = roundMoney(items.reduce((sum, item) => sum + cartLineTotal(item), 0))
  const cleanDiscount = Math.min(subtotalAmount, Math.max(0, Number(discountAmount || 0)))
  const taxableAmount = roundMoney(subtotalAmount - cleanDiscount)
  const taxAmount = roundMoney(taxableAmount * (Math.max(0, Number(taxRate || 0)) / 100))
  const totalAmount = roundMoney(taxableAmount + taxAmount)
  return {
    discountAmount: roundMoney(cleanDiscount),
    subtotalAmount,
    taxableAmount,
    taxAmount,
    taxRate: Number(taxRate || 0),
    totalAmount,
  }
}

export function getLocalizedMenuLabel(type, value, language) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
  return i18n.t(`menu.${type}.${key}`, { defaultValue: value, lng: language })
}

export function buildDefaultCustomizations(item) {
  return {
    ...(item.ingredients?.length
      ? { Ingredients: item.ingredients.map((name) => ({ name, extraPrice: 0 })) }
      : {}),
    ...Object.fromEntries((item.options || []).map((option) => [option.label, []])),
  }
}

export function observeAuth(callback) {
  let active = true
  let version = 0
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase auth callbacks run under the auth lock. Defer profile queries.
    const current = ++version
    setTimeout(() => { if (active && current === version) callback(session?.user ?? null) }, 0)
  })
  return () => { active = false; subscription.unsubscribe() }
}

export async function loginAdmin(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase()
  // Passwords are opaque credentials. Trimming them changes valid passwords.
  const normalizedPassword = String(password || "")
  if (!normalizedEmail) throw new Error("Email is required.")
  if (!normalizedPassword) throw new Error("Password is required.")
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: normalizedPassword })
  // Preserve status/code for safe, accurate presentation by the login form.
  if (error) throw error
  // An optional audit failure must not turn a successful login into a failure.
  void writeAuditLog("auth.login", { email: normalizedEmail }).catch((auditError) => {
    if (import.meta.env.DEV) console.warn("Login audit could not be written", auditError)
  })
  return data
}

export async function logoutAdmin() {
  const { data: { session } } = await supabase.auth.getSession()
  await writeAuditLog("auth.logout", { email: session?.user?.email || "" })
  const { error } = await supabase.auth.signOut()
  if (error) {
    await supabase.auth.signOut({ scope: "local" })
  }
  uploadDeduplicationCache.clear()
  proofUrlCache.clear()
  for (const key of ["cafe-user-roles", "cafe_subscription_requests", "cafe_current_slug", "cafe-notifications", "cafe_platform_announcements"]) localStorage.removeItem(key)
}

export async function deleteAuthUser(uid) {
  assertPlanFeature("userManagement")
  let rpcError = null
  try {
    const { error } = await supabase.rpc("delete_staff_user", { p_uid: uid })
    rpcError = error || null
  } catch (error) {
    rpcError = error
  }
  if (rpcError) {
    // Never report success when the auth deletion failed — the UI would show
    // a user as deleted while the account still exists.
    throw new Error(rpcError.message || "Could not delete the user account.")
  }
  await writeAuditLog("user.delete", { id: uid })
}

export async function fetchUserLanguage(uid) {
  if (!uid) return "en"
  const { data, error } = await supabase.from("user_roles").select("language").eq("id", uid).maybeSingle()
  if (error || !data) return "en"
  return data.language || "en"
}

export async function saveUserLanguage(uid, language) {
  if (!uid) return
  const { error } = await supabase.from("user_roles").update({ language }).eq("id", uid)
  if (error) throw new Error(error.message || "Could not save language preference.")
}

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

export async function sendPushToCustomer(orderId, title, body) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch(`${SUPABASE_FUNCTIONS_URL}/send-push`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ orderId, title, body }),
    })
  } catch {
    /* best effort */
  }
}

export function observeMenuItems(callback, onError, cafeSlug = currentCafeSlug()) {
  const slug = String(cafeSlug || "").trim().toLowerCase()
  if (!slug) {
    callback([])
    return () => {}
  }

  let cancelled = false
  let channel = null
  const fetch = async () => {
    try {
      const { data, error } = await supabase.rpc("get_public_menu", { p_cafe_slug: slug })
      if (error) throw error
      if (!cancelled) await callback(toCamelCase(data || []))
    } catch (err) {
      if (!cancelled) onError?.(toUserMessage(err, "Menu could not load."))
    }
  }

  fetch()
  // An anonymous customer cannot subscribe directly to a protected table.
  // Polling keeps the public menu fresh, while signed-in staff also receive
  // the filtered Realtime event below.
  const poll = setInterval(fetch, 30000)
  try {
    channel = supabase.channel(`public-menu-${slug}-${Date.now()}-${observeTableSeq++}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `cafe_slug=eq.${slug}` }, fetch)
      .subscribe()
  } catch {}

  return () => {
    cancelled = true
    clearInterval(poll)
    if (channel) supabase.removeChannel(channel).catch?.(() => {})
  }
}

export function observeTables(callback, onError) {
  return observeTable(
    "tables",
    (q) => q.order("table_number", { ascending: true }),
    (data) => callback(data.sort((a, b) => Number(a.tableNumber) - Number(b.tableNumber))),
    onError,
  )
}

export function observePaymentOptions(callback, includeInactive = false, onError) {
  if (!includeInactive) return observeRpc("get_public_payment_options", { p_cafe_slug: requireCurrentCafeSlug() }, callback, onError, "payment_options")
  return observeTable(
    "payment_options",
    null,
    (data) => callback(includeInactive ? data : data.filter((o) => o.active)),
    onError,
  )
}

export function observeBillingSettings(callback, onError) {
  return observeRpc("get_public_billing_settings", { p_cafe_slug: requireCurrentCafeSlug() },
    (rows) => callback({ ...DEFAULT_BILLING_SETTINGS, ...(rows[0] || {}) }), onError, "settings")
}

// Public projections and kitchen data cannot subscribe to protected financial
// rows. A bounded poll complements tenant-filtered Realtime updates.
function observeRpc(name, args, callback, onError, table, interval = 30000) {
  let cancelled = false
  let channel = null
  let inFlight = false
  const fetch = async () => {
    if (inFlight || cancelled) return
    inFlight = true
    try {
      const rows = []
      let offset = 0
      do {
        const paginated = name === "get_staff_orders"
        const { data, error } = await supabase.rpc(name, paginated ? { ...args, p_limit: 1000, p_offset: offset } : args)
        if (error) throw error
        if (cancelled) return
        rows.push(...(data || []))
        if (!paginated || !data || data.length < 1000) break
        offset += data.length
      } while (!cancelled)
      if (!cancelled) await callback(toCamelCase(rows))
    } catch (err) {
      if (!cancelled) onError?.(toUserMessage(err, "Data could not load."))
    } finally { inFlight = false }
  }
  fetch()
  const poll = setInterval(() => { if (!document.hidden) fetch() }, interval)
  try {
    channel = supabase.channel(`${name}-${Date.now()}-${observeTableSeq++}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `cafe_slug=eq.${args.p_cafe_slug}` }, fetch)
      .subscribe()
  } catch {}
  return () => {
    cancelled = true
    clearInterval(poll)
    if (channel) supabase.removeChannel(channel).catch?.(() => {})
  }
}

export async function saveBillingSettings(settings) {
  assertPlanFeature("settings")
  const payload = {
    ...DEFAULT_BILLING_SETTINGS,
    ...settings,
    taxRate: Number(settings.taxRate || 0),
  }
  // Upsert this cafe's own row; the platform default row stays untouched.
  const { error } = await supabase.from("settings").upsert({ id: billingSettingsId(), cafe_slug: requireCurrentCafeSlug(), ...toSnakeCase(payload) })
  if (error) throw error
  await writeAuditLog("settings.billing.update", { taxRate: payload.taxRate })
  return billingSettingsId()
}

export async function savePaymentOption(option) {
  assertPlanFeature("settings")
  const payload = stripUndefined(sanitizePaymentOption(option))
  // New ids carry the cafe slug so two cafes can never collide on the shared
  // primary key; edits keep the row's existing id.
  const id = option.id || `payment-${requireCurrentCafeSlug()}-${Date.now()}`
  const { error } = await supabase.from("payment_options").upsert({ id, cafe_slug: requireCurrentCafeSlug(), ...toSnakeCase(payload) })
  if (error) throw error
  await writeAuditLog(option.id ? "paymentOption.update" : "paymentOption.create", { id, name: payload.name })
  return id
}

export async function savePushSubscription({ orderId = null, role = "customer", subscription }) {
  if (!subscription?.endpoint) throw new Error("Push subscription is missing an endpoint.")

  // Customer order tracking intentionally works without an Auth session. The
  // database RPC validates the order capability, payload shape, and derives
  // the cafe from the order server-side; never permit anonymous table writes.
  if (role === "customer") {
    if (!orderId) throw new Error("An order is required for customer notifications.")
    const { error } = await supabase.rpc("save_customer_push_subscription", {
      p_order_id: orderId,
      p_subscription: subscription,
      p_token: orderTokens(currentCafeSlug())[orderId],
      p_cafe_slug: requireCurrentCafeSlug(),
    })
    if (error) throw error
    return
  }

  const subscriptionKey = `${role}:${orderId || "all"}:${subscription.endpoint}`
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Sign in to enable staff notifications.")
  const encodedEndpoint = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subscriptionKey))
  const subscriptionId = [...new Uint8Array(encodedEndpoint)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  const payload = stripUndefined({
    updatedAt: new Date().toISOString(),
    endpoint: subscription.endpoint,
    orderId,
    role,
    subscription,
    cafeSlug: requireCurrentCafeSlug(),
    userId: user.id,
  })
  const { error } = await supabase.from("push_subscriptions").upsert({ id: subscriptionId, ...toSnakeCase(payload) })
  if (error) throw error
}

export async function deletePaymentOption(optionId) {
  assertPlanFeature("settings")
  const { error } = await supabase.from("payment_options").delete().eq("id", optionId).eq("cafe_slug", requireCurrentCafeSlug())
  if (error) throw error
  await writeAuditLog("paymentOption.delete", { id: optionId })
}

const orderObservers = new Map()
export function observeOrders(callback, onError, scopeOverride) {
  const slug = requireCurrentCafeSlug()
  const path = window.location.pathname.toLowerCase()
  const scope = scopeOverride || (/\/(kds|orders)\/?$/.test(path) ? "active" : /\/pos\/?$/.test(path) ? "cashier" : "all")
  const key = `${slug}:${scope}`
  let entry = orderObservers.get(key)
  if (!entry) {
    entry = { listeners: new Set(), rows: null }
    orderObservers.set(key, entry)
    entry.stop = observeRpc("get_staff_orders", { p_cafe_slug: slug, p_scope: scope }, async (rows) => {
      await resolveProofUrls(rows)
      if (orderObservers.get(key) !== entry) return
      entry.rows = rows
      entry.listeners.forEach((listener) => listener.callback(rows))
    }, (error) => entry.listeners.forEach((listener) => listener.onError?.(error)), "orders", scope === "all" || scope === "recent" ? 30000 : 5000)
  }
  const listener = { callback, onError }
  entry.listeners.add(listener)
  if (entry.rows) callback(entry.rows)
  return () => {
    entry.listeners.delete(listener)
    if (!entry.listeners.size) { entry.stop(); orderObservers.delete(key) }
  }
}

export async function fetchPopularItems(cafeSlug) {
  // The RPC is tenant-scoped: staff callers are pinned to their own cafe and
  // anonymous customer menus must pass the cafe from the URL.
  const { data, error } = await supabase.rpc("get_popular_items", {
    p_cafe_slug: (cafeSlug || currentCafeSlug() || "").toLowerCase() || null,
  })
  if (error) throw error
  const counts = {}
  for (const row of data || []) {
    const id = row?.itemId ?? row?.item_id
    if (!id) continue
    counts[id] = Number(row?.quantity || 0)
  }
  return counts
}

function isSafeStorageUrl(url) {
  if (!url) return false
  try {
    const u = new URL(url)
    const project = new URL(SUPABASE_URL)
    return u.origin === project.origin && /^\/storage\/v1\/object\/(?:public\/cafe-assets|sign\/payment-proofs)\//.test(u.pathname)
  } catch {
    return false
  }
}

export function observeOrdersByIds(ids, callback, onError) {
  if (!ids?.length) {
    callback([])
    return () => {}
  }
  let cancelled = false

  const fetch = async () => {
    try {
      const { data, error } = await supabase.rpc("get_orders_by_ids", { p_ids: ids, p_tokens: orderTokens(currentCafeSlug()), p_cafe_slug: requireCurrentCafeSlug() })
      if (error) throw error
      if (!cancelled) callback((data || []).map(toCamelCase))
    } catch (err) {
      if (!cancelled) onError?.(toUserMessage(err, "Orders could not load."))
    }
  }

  fetch()
  const poll = setInterval(fetch, 5000)

  // Staff get realtime updates; anonymous fallback polls
  try {
    const channel = supabase.channel(`orders-ids-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=in.(${ids.join(',')})` }, () => {
        if (!cancelled) fetch()
      })
      .subscribe()
    return () => { cancelled = true; clearInterval(poll); supabase.removeChannel(channel).catch?.(() => {}) }
  } catch {
    return () => { cancelled = true; clearInterval(poll) }
  }
}

export function observeOrder(orderId, callback, onError) {
  let cancelled = false
  let channel = null

  const fetch = async () => {
    try {
      // Anonymous customers can no longer SELECT the orders table (C2 fix).
      // Tracking goes through the single-order SECURITY DEFINER RPC.
      const { data, error } = await supabase.rpc("get_order_for_tracking", { p_order_id: orderId, p_token: orderTokens(currentCafeSlug())[orderId], p_cafe_slug: requireCurrentCafeSlug() })
      if (error) throw error
      const order = data ? { id: data.id, ...toCamelCase(data) } : null
      if (order) await resolveProofUrls([order], orderTokens(currentCafeSlug())[orderId])
      if (!cancelled) callback(order)
    } catch (err) {
      if (!cancelled) onError?.(toUserMessage(err, "Order could not load."))
    }
  }

  fetch()

  // Staff get realtime updates; anonymous subscribers receive nothing (RLS),
  // so polling is the tracking fallback for customers.
  const poll = setInterval(fetch, 5000)

  try {
    const channelName = `order-${orderId}-${Date.now()}-${observeTableSeq++}`
    channel = supabase.channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => {
        if (!cancelled) fetch()
      })
      .subscribe()
  } catch {}

  return () => {
    cancelled = true
    clearInterval(poll)
    if (channel) supabase.removeChannel(channel).catch?.(() => {})
  }
}

export async function createOrder(order) {
  const slug = requireCurrentCafeSlug()
  const token = order.requestToken || newOrderToken()
  const cleanItems = (order.items || []).slice(0, 50).map((item) => ({
    ...item,
    itemId: item.itemId || item.id,
    quantity: Math.max(1, Number(item.quantity || 1)),
  }))
  if (!cleanItems.length) throw new Error("Order must include at least one item.")
  const { data, error } = await supabase.rpc("create_customer_order", {
    p_table_number: String(order.tableNumber || "").slice(0, 40),
    p_items: cleanItems.map(({ cartId: _cartId, ...item }) => item),
    p_estimated_ready_minutes: Math.max(0, Number(order.estimatedReadyMinutes || 0) || 0),
    p_cafe_slug: slug,
    p_token: token,
    p_payment_method: order.paymentMethod || "Cash",
  })
  if (error) throw new Error(error.message || "Could not place the order.")
  saveOrderToken(slug, data, token)
  return data
}

export async function fetchCustomerOrder(orderId) {
  const slug = requireCurrentCafeSlug()
  const { data, error } = await supabase.rpc("get_order_for_tracking", {
    p_order_id: orderId, p_cafe_slug: slug, p_token: orderTokens(slug)[orderId],
  })
  if (error || !data) throw new Error("Your order could not be loaded. Please retry.")
  return toCamelCase(data)
}

export async function updateStaffOrder(orderId, changes) {
  const { error } = await supabase.rpc("update_staff_order", {
    p_order_id: orderId,
    p_changes: stripUndefined(changes),
  })
  if (error) throw new Error(error.message || "Could not update the order.")
  await writeAuditLog("order.update", { id: orderId, changes })
}

export async function updateCustomerOrder(orderId, { paymentMethod, clearMethod, paymentProofUrl, clearProof } = {}) {
  const { error } = await supabase.rpc("update_customer_order", {
    p_order_id: orderId,
    p_payment_method: paymentMethod ?? null,
    p_clear_method: Boolean(clearMethod),
    p_payment_proof_url: paymentProofUrl ?? null,
    p_clear_proof: Boolean(clearProof),
    p_token: orderTokens(currentCafeSlug())[orderId],
    p_cafe_slug: requireCurrentCafeSlug(),
  })
  if (error) throw new Error(error.message || "Could not update the order.")
}

export async function saveMenuItem(item, imageFile) {
  assertPlanFeature("menuManagement")
  const imageUrl = imageFile ? await uploadAsset(`menuImages/${Date.now()}`, imageFile) : item.imageUrl
  const cleanItem = { ...item }
  delete cleanItem.ingredientsText
  delete cleanItem.optionsText
  const payload = stripUndefined(sanitizeMenuItem({ ...cleanItem, imageUrl }))
  if (item.id) {
    const { id, ...rest } = payload
    const { error } = await supabase.from("menu_items").update(toSnakeCase(rest)).eq("id", id).eq("cafe_slug", requireCurrentCafeSlug())
    if (error) throw error
    await writeAuditLog("menuItem.update", { id, name: payload.name })
    return id
  }
  const { data, error } = await supabase.from("menu_items").insert({ ...toSnakeCase(payload), cafe_slug: requireCurrentCafeSlug() }).select("id").single()
  if (error) throw error
  await writeAuditLog("menuItem.create", { id: data.id, name: payload.name })
  return data.id
}

export async function deleteMenuItem(itemId) {
  assertPlanFeature("menuManagement")
  const { error } = await supabase.from("menu_items").delete().eq("id", itemId).eq("cafe_slug", requireCurrentCafeSlug())
  if (error) throw error
  await writeAuditLog("menuItem.delete", { id: itemId })
}

export async function updateMenuAvailability(itemId, available) {
  assertPlanFeature("menuManagement")
  const { error } = await supabase.from("menu_items").update({ available }).eq("id", itemId).eq("cafe_slug", requireCurrentCafeSlug())
  if (error) throw error
  await writeAuditLog("menuItem.availability", { id: itemId, available })
}

export async function saveTable(table, cafeSlug) {
  assertPlanFeature("tables")
  if (!cafeSlug) throw new Error("A cafe slug is required to save a table.")
  const payload = stripUndefined({ ...table, cafeSlug })
  const id = payload.id || `table-${cafeSlug}-${payload.tableNumber}`
  const { error } = await supabase.from("tables").upsert({ id, ...toSnakeCase(payload) })
  if (error) throw error
  await writeAuditLog(table.id ? "table.update" : "table.create", { id, tableNumber: payload.tableNumber, cafeSlug })
  return id
}

export async function deleteTable(tableId) {
  assertPlanFeature("tables")
  const { error } = await supabase.from("tables").delete().eq("id", tableId).eq("cafe_slug", requireCurrentCafeSlug())
  if (error) throw error
  await writeAuditLog("table.delete", { id: tableId })
}

export async function uploadAsset(path, file, { onProgress, signal, generateVariants = true } = {}) {
  const validationError = validateImage(file, { maxSizeMB: 5 })
  if (validationError) throw new Error(validationError)

  // Tenant-scope upload paths (menuImages/{cafeSlug}/...,
  // paymentProofs/{cafeSlug}/...) so a cafe's files can be removed together
  // when the cafe is deleted.
  const slug = currentCafeSlug()
  const scopedPath =
    slug && (path.startsWith("menuImages/") || path.startsWith("paymentProofs/"))
      ? path.replace(/^(menuImages|paymentProofs)\//, `$1/${slug}/`)
      : path

  // SHA-256 Deduplication check. The cache key is scoped to the acting cafe
  // so identical files uploaded by different tenants never share a URL.
  let hash = ""
  try {
    hash = await computeFileHash(file)
    const cacheKey = `${scopedPath}:${hash}`
    if (uploadDeduplicationCache.has(cacheKey)) {
      return uploadDeduplicationCache.get(cacheKey)
    }
    hash = cacheKey
  } catch {
    // Continue if hashing fails
  }

  const isPaymentProof = path.startsWith("paymentProofs/")
  const blob = await optimizeImage(file, {
    maxWidth: isPaymentProof ? 1200 : 800,
    maxHeight: isPaymentProof ? 1200 : 800,
    maxSizeMB: isPaymentProof ? 0.5 : 0.2,
    quality: 0.82,
    onProgress,
  })

  const mime = "image/webp"
  const ext = "webp"
  const safePath = `${scopedPath}.${ext}`

  if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError")

  const publicUrl = await storageUpload(safePath, blob, mime)

  // Upload variants if enabled
  if (generateVariants && !isPaymentProof) {
    try {
      const variants = await generateResponsiveVariants(file)
      for (const [variantKey, variantBlob] of Object.entries(variants)) {
        if (variantKey !== "md") {
          const variantPath = `${scopedPath}_${variantKey}.${ext}`
          await storageUpload(variantPath, variantBlob, mime).catch(() => {})
        }
      }
    } catch {
      // Ignore variant errors, main asset is uploaded
    }
  }

  if (hash) {
    uploadDeduplicationCache.set(hash, publicUrl)
  }

  return publicUrl
}

export async function uploadPaymentProof(orderId, file, { onProgress, signal } = {}) {
  const validation = validateImage(file, { maxSizeMB: 5 })
  if (validation) throw new Error(validation)
  const slug = requireCurrentCafeSlug()
  const token = orderTokens(slug)[orderId]
  const client = customerStorageClient(token)
  const blob = await optimizeImage(file, { maxWidth: 1200, maxHeight: 1200, maxSizeMB: 0.5, quality: 0.82, onProgress })
  if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError")
  const path = `${slug}/${orderId}/${crypto.randomUUID()}.webp`
  const { error } = await client.storage.from("payment-proofs").upload(path, blob, { contentType: "image/webp" })
  if (error) throw error
  await updateCustomerOrder(orderId, { paymentProofUrl: path })
  const rows = [{ paymentProofUrl: path }]
  await resolveProofUrls(rows, token)
  return rows[0].paymentProofUrl
}

const proofUrlCache = new Map()
async function resolveProofUrls(orders, token = null) {
  const client = token ? customerStorageClient(token) : supabase
  await Promise.all(orders.map(async (order) => {
    const path = order.paymentProofUrl
    if (!path || /^https?:/.test(path)) return
    const cacheKey = `${token || "staff"}:${path}`
    const cached = proofUrlCache.get(cacheKey)
    if (cached?.expires > Date.now()) { order.paymentProofUrl = cached.url; return }
    const { data, error } = await client.storage.from("payment-proofs").createSignedUrl(path, 600)
    if (!error && data?.signedUrl) {
      order.paymentProofUrl = data.signedUrl
      if (proofUrlCache.size > 100) proofUrlCache.clear()
      proofUrlCache.set(cacheKey, { url: data.signedUrl, expires: Date.now() + 540000 })
    } else order.paymentProofUrl = ""
  }))
  return orders
}

export async function savePaymentProofUrl(orderId, paymentProofUrl) {
  await updateCustomerOrder(orderId, { paymentProofUrl })
  await writeAuditLog("order.paymentProof.url", { id: orderId, paymentProofUrl })
  return paymentProofUrl
}

export async function createAuthUser(email, password, displayName, role = "barista") {
  assertPlanFeature("userManagement")
  const normalizedEmail = String(email || "").trim().toLowerCase()
  const suppliedPassword = String(password || "")
  const normalizedRole = String(role || "barista").trim().toLowerCase()
  if (!normalizedEmail) throw new Error("Email is required.")
  if (suppliedPassword.length < 6) throw new Error("Password must be at least 6 characters.")
  if (!new Set(["admin", "manager", "cashier", "barista"]).has(normalizedRole)) {
    throw new Error("Choose a valid staff role.")
  }
  try {
    const { data, error } = await supabase.rpc("create_staff_user", {
      p_email: normalizedEmail,
      // Passwords are intentionally not trimmed or normalized. They are
      // opaque credentials and must be sent exactly as the admin entered them.
      p_password: suppliedPassword,
      p_display_name: displayName || "",
      p_role: normalizedRole,
    })
    if (error) throw error

    await writeAuditLog("user.create", { email, displayName, role: normalizedRole })
    return data
  } catch (error) {
    const msg = error?.message || ""
    if (/already.*registered|email.*already/i.test(msg)) throw new Error("This email is already registered.")
    if (/password must be at least 6 characters/i.test(msg)) {
      throw new Error("Password must be at least 6 characters.")
    }
    if (/staff accounts|staff-account allocation/i.test(msg)) {
      throw new Error(msg)
    }
    throw new Error(error?.message || "Could not create user.")
  }
}

export function observeCollection(collectionName, callback, onError) {
  if (collectionName === "inventory") return observeRpc("get_cafe_inventory", { p_cafe_slug: requireCurrentCafeSlug() }, callback, onError, "inventory")
  return observeTable(collectionName, null, callback, onError)
}

export async function saveInventory(item) {
  assertPlanFeature("inventory")
  const row = {
    name: cleanText(item.name, 120), category: cleanText(item.category, 80), unit: cleanText(item.unit, 40),
    quantity: assertFiniteNumber(item.quantity, "Quantity"),
    low_stock_threshold: assertFiniteNumber(item.lowStockThreshold, "Low stock threshold"),
    supplier_cost: assertFiniteNumber(item.supplierCost || 0, "Supplier cost"),
    cafe_slug: requireCurrentCafeSlug(), updated_at: new Date().toISOString(),
  }
  if (!row.name) throw new Error("Item name is required.")
  const query = item.id
    ? supabase.from("inventory").update(row).eq("id", item.id).eq("cafe_slug", row.cafe_slug)
    : supabase.from("inventory").insert(row)
  const { error } = await query.select("id").single()
  if (error) throw new Error("Inventory could not be saved. Check your access and try again.")
}

export async function deleteInventory(id) {
  assertPlanFeature("inventory")
  const { error } = await supabase.from("inventory").delete().eq("id", id).eq("cafe_slug", requireCurrentCafeSlug()).select("id").single()
  if (error) throw new Error("Inventory item could not be removed.")
}

export function observeCafeUsers(cafeSlug, callback, onError) {
  const slug = (cafeSlug || "").toLowerCase()
  if (!slug) {
    callback([])
    return () => {}
  }
  return observeTable(
    "user_roles",
    (q) => q.eq("cafe_slug", slug),
    callback,
    onError,
  )
}

export { isSafeStorageUrl }
