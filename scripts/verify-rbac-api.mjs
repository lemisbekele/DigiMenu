// API-level verification of the package-gated RBAC (migration 08).
// Seeds local test data (cafes, subscriptions, users, menu items) via the
// service key, then exercises RLS + RPC gates with real JWTs.
//
//   node scripts/verify-rbac-api.mjs
//
// Idempotent: existing users/cafes are reused. Requires the local Supabase
// stack (`supabase start`). Uses the default local JWT secret.

import crypto from "node:crypto"
import { execSync } from "node:child_process"

const BASE = "http://127.0.0.1:54321"
const ANON = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"
const PASS = "verify-pass-123"

const serviceJwt = (() => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const header = enc({ alg: "HS256", typ: "JWT" })
  const now = Math.floor(Date.now() / 1000)
  const payload = enc({ role: "service_role", iss: "supabase", iat: now, exp: now + 3600 })
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url")
  return `${header}.${payload}.${sig}`
})()

async function req(path, { method = "GET", body, token, admin = false } = {}) {
  const headers = { apikey: ANON }
  headers.Authorization = admin ? `Bearer ${serviceJwt}` : `Bearer ${token || ANON}`
  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    headers.Prefer = "return=representation"
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json }
}

async function login(email) {
  const r = await req("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password: PASS },
  })
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.access_token
}

async function adminCreateUser(email, displayName) {
  const r = await req("/auth/v1/admin/users", {
    method: "POST",
    admin: true,
    body: { email, password: PASS, email_confirm: true, user_metadata: { display_name: displayName } },
  })
  if (r.status === 200) return r.json.id
  if (r.status === 422) {
    // Already exists — resolve the uid straight from the DB (GoTrue's admin
    // list endpoint can 500 on this local build).
    const sql = `select id from auth.users where lower(email) = lower('${email.replace(/'/g, "''")}')`
    const out = execSync(`docker exec supabase_db_Cafe psql -U postgres -d postgres -t -A -c "${sql}"`, { encoding: "utf8" }).trim()
    if (out) return out
  }
  throw new Error(`createUser ${email}: ${r.status} ${JSON.stringify(r.json)}`)
}

const now = new Date().toISOString()
const pass = [], fail = []
function check(name, ok, detail = "") {
  ;(ok ? pass : fail).push(name)
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
}

const out = await req("/rest/v1/cafes?select=id,slug,status", { admin: true })
const existing = (out.json || []).reduce((m, c) => ((m[c.slug] = c), m), {})
const cafeId = (slug) => existing[slug]?.id || `cafe_${crypto.randomUUID()}`

console.log("== Seeding users ==")
const users = {}
for (const [email, display] of [
  ["superadmin@digimenu.app", "Platform Owner"],
  ["admin@babi-shop.com", "Babi Admin"],
  ["admin@yohannes-coffee.com", "Yohannes Admin"],
  ["admin@enterprise-cafe.com", "Enterprise Admin"],
  ["admin@no-sub-cafe.com", "NoSub Admin"],
  ["barista@babi-shop.com", "Babi Barista"],
  ["staff@enterprise-cafe.com", "Enterprise Staff"],
  ["barista@no-sub-cafe.com", "NoSub Barista"],
]) {
  users[email] = await adminCreateUser(email, display)
  console.log(`  ${email} -> ${users[email]}`)
}

console.log("== Seeding cafes / subscriptions / roles / menu / settings ==")
const cafes = {
  "babi-shop": { id: cafeId("babi-shop"), plan: "starter" },
  "yohannes-coffee": { id: cafeId("yohannes-coffee"), plan: "professional" },
  "enterprise-cafe": { id: cafeId("enterprise-cafe"), plan: "enterprise" },
  "no-sub-cafe": { id: cafeId("no-sub-cafe"), plan: null },
}
for (const [slug, c] of Object.entries(cafes)) {
  if (!existing[slug]) {
    const r = await req("/rest/v1/cafes", { method: "POST", admin: true, body: { id: c.id, name: slug, slug, status: "active" } })
    if (r.status >= 400) throw new Error(`create cafe ${slug}: ${r.status} ${JSON.stringify(r.json)}`)
  }
  if (c.plan) {
    const subId = `sub_${slug}`
    const r = await req(`/rest/v1/subscription_requests?id=eq.${subId}`, { method: "GET", admin: true })
    if ((r.json || []).length === 0) {
      const body = {
        id: subId, plan_key: c.plan, status: "active", cafe_id: c.id, cafe_slug: slug,
        email: Object.keys(users).find((e) => e.includes(slug.replace("-coffee", ""))),
        customer_admin_id: users[`admin@${slug}.com`] || users["admin@babi-shop.com"],
        activated_at: now, updated_at: now,
      }
      const ins = await req("/rest/v1/subscription_requests", { method: "POST", admin: true, body })
      if (ins.status >= 400) throw new Error(`create sub ${slug}: ${ins.status} ${JSON.stringify(ins.json)}`)
    }
  }
}

const roleByCafe = {
  "babi-shop": [["admin", "admin@babi-shop.com"], ["barista", "barista@babi-shop.com"]],
  "yohannes-coffee": [["admin", "admin@yohannes-coffee.com"]],
  "enterprise-cafe": [["admin", "admin@enterprise-cafe.com"], ["barista", "barista@enterprise-cafe.com"], ["barista", "staff@enterprise-cafe.com"]],
  "no-sub-cafe": [["admin", "admin@no-sub-cafe.com"], ["barista", "barista@no-sub-cafe.com"]],
}
for (const [slug, entries] of Object.entries(roleByCafe)) {
  for (const [role, email] of entries) {
    const uid = users[email]
    const r = await req(`/rest/v1/user_roles?select=id&id=eq.${uid}`, { method: "GET", admin: true })
    if ((r.json || []).length === 0) {
      const ins = await req("/rest/v1/user_roles", {
        method: "POST", admin: true,
        body: { id: uid, email, role, display_name: email, cafe_id: cafes[slug].id, cafe_slug: slug, language: "en" },
      })
      if (ins.status >= 400) throw new Error(`create role ${email}: ${ins.status} ${JSON.stringify(ins.json)}`)
    }
  }
}
{
  const r = await req(`/rest/v1/user_roles?select=id&id=eq.${users["superadmin@digimenu.app"]}`, { method: "GET", admin: true })
  if ((r.json || []).length === 0) {
    const ins = await req("/rest/v1/user_roles", {
      method: "POST", admin: true,
      body: { id: users["superadmin@digimenu.app"], email: "superadmin@digimenu.app", role: "superadmin", display_name: "Platform Owner", language: "en" },
    })
    if (ins.status >= 400) throw new Error(`create superadmin role: ${ins.status} ${JSON.stringify(ins.json)}`)
  }
}

const menuItems = {}
for (const [slug, name, price] of [
  ["babi-shop", "Macchiato", 120],
  ["yohannes-coffee", "Latte", 90],
  ["enterprise-cafe", "Flat White", 100],
  ["no-sub-cafe", "Cappuccino", 80],
]) {
  const r = await req(`/rest/v1/menu_items?select=id&cafe_slug=eq.${slug}&name=eq.${name}`, { method: "GET", admin: true })
  if ((r.json || []).length > 0) { menuItems[slug] = r.json[0].id; continue }
  const ins = await req("/rest/v1/menu_items", {
    method: "POST", admin: true,
    body: { name, price, category: "Coffee", available: true, cafe_slug: slug },
  })
  if (ins.status >= 400) throw new Error(`create menu ${slug}: ${ins.status} ${JSON.stringify(ins.json)}`)
  menuItems[slug] = ins.json[0].id
}
{
  const r = await req("/rest/v1/settings?select=id,cafe_slug&id=eq.billing", { method: "GET", admin: true })
  if ((r.json || []).length === 0) {
    const ins = await req("/rest/v1/settings", { method: "POST", admin: true, body: { id: "billing", tax_rate: 15, cafe_slug: "enterprise-cafe" } })
    if (ins.status >= 400) throw new Error(`create settings billing: ${ins.status} ${JSON.stringify(ins.json)}`)
  } else if (r.json[0].cafe_slug !== "enterprise-cafe") {
    const ins = await req("/rest/v1/settings?id=eq.billing", { method: "PATCH", admin: true, body: { cafe_slug: "enterprise-cafe" } })
    if (ins.status >= 400) throw new Error(`patch settings billing: ${ins.status} ${JSON.stringify(ins.json)}`)
  }
}

console.log("== Logging in ==")
const tokens = {}
for (const email of Object.keys(users)) tokens[email] = await login(email)

const items = (slug, qty = 1) => [{ itemId: menuItems[slug], quantity: qty }]
const expectErr = (r, needle) => {
  const msg = typeof r.json === "object" && r.json !== null ? r.json.message || JSON.stringify(r.json) : String(r.json || "")
  return r.status >= 400 && msg.toLowerCase().includes(needle.toLowerCase())
}

console.log("== A. Customer ordering (anon) ==")
{
  const r = await req("/rest/v1/rpc/create_customer_order", {
    method: "POST", token: ANON, body: { p_table_number: "T1", p_items: items("babi-shop", 2) },
  })
  check("anon order at starter babi-shop (ordering in package)", r.status === 200 && typeof r.json === "string", r.status)
  const noSub = await req("/rest/v1/rpc/create_customer_order", {
    method: "POST", token: ANON, body: { p_table_number: "T1", p_items: items("no-sub-cafe") },
  })
  check("anon order at no-subscription cafe blocked", expectErr(noSub, "not accepting orders"), `${noSub.status} ${JSON.stringify(noSub.json)}`)
  const ent = await req("/rest/v1/rpc/create_customer_order", {
    method: "POST", token: ANON, body: { p_table_number: "T1", p_items: items("enterprise-cafe") },
  })
  check("anon order at enterprise cafe accepted", ent.status === 200, ent.status)
  const up = await req("/rest/v1/rpc/update_customer_order", {
    method: "POST", token: ANON, body: { p_order_id: r.json, p_payment_method: "cash" },
  })
  check("anon payment-method update on own order", up.status === 204, up.status)
  const bad = await req("/rest/v1/rpc/create_customer_order", {
    method: "POST", token: ANON, body: { p_table_number: "T1", p_items: [{ itemId: "00000000-0000-0000-0000-000000000000", quantity: 1 }] },
  })
  check("unknown item rejected", expectErr(bad, "no longer available"), `${bad.status} ${JSON.stringify(bad.json)}`)
}

console.log("== B. menu_items RLS (menuManagement) ==")
{
  const starter = await req("/rest/v1/menu_items", {
    method: "POST", token: tokens["admin@babi-shop.com"],
    body: { name: "Sneaky", price: 1, cafe_slug: "babi-shop" },
  })
  check("starter admin menu insert blocked (no menuManagement)", starter.status === 403, starter.status)
  const prof = await req("/rest/v1/menu_items", {
    method: "POST", token: tokens["admin@yohannes-coffee.com"],
    body: { name: "Cortado", price: 95, cafe_slug: "yohannes-coffee" },
  })
  check("professional admin menu insert allowed", prof.status === 201, prof.status)
  const ent = await req("/rest/v1/menu_items", {
    method: "POST", token: tokens["admin@enterprise-cafe.com"],
    body: { name: "Affogato", price: 110, cafe_slug: "enterprise-cafe" },
  })
  check("enterprise admin menu insert allowed", ent.status === 201, ent.status)
  const nosub = await req("/rest/v1/menu_items", {
    method: "POST", token: tokens["admin@no-sub-cafe.com"],
    body: { name: "Sneaky", price: 1, cafe_slug: "no-sub-cafe" },
  })
  check("no-subscription admin menu insert blocked", nosub.status === 403, nosub.status)
  const cross = await req("/rest/v1/menu_items", {
    method: "POST", token: tokens["admin@yohannes-coffee.com"],
    body: { name: "Cross", price: 1, cafe_slug: "enterprise-cafe" },
  })
  check("cross-cafe menu insert blocked", cross.status === 403, cross.status)
}

console.log("== C. set_user_role (userManagement) ==")
{
  const target = users["staff@enterprise-cafe.com"]
  const starter = await req("/rest/v1/rpc/set_user_role", {
    method: "POST", token: tokens["admin@babi-shop.com"], body: { p_uid: target, p_role: "manager" },
  })
  check("starter admin role change blocked", expectErr(starter, "not authorized"), `${starter.status} ${JSON.stringify(starter.json)}`)
  const prof = await req("/rest/v1/rpc/set_user_role", {
    method: "POST", token: tokens["admin@yohannes-coffee.com"], body: { p_uid: target, p_role: "manager" },
  })
  check("professional admin role change blocked (no userManagement)", expectErr(prof, "not authorized"), `${prof.status} ${JSON.stringify(prof.json)}`)
  const ent = await req("/rest/v1/rpc/set_user_role", {
    method: "POST", token: tokens["admin@enterprise-cafe.com"], body: { p_uid: target, p_role: "manager" },
  })
  check("enterprise admin role change allowed", ent.status === 204, `${ent.status} ${JSON.stringify(ent.json)}`)
  const nosub = await req("/rest/v1/rpc/set_user_role", {
    method: "POST", token: tokens["admin@no-sub-cafe.com"], body: { p_uid: target, p_role: "manager" },
  })
  check("no-subscription admin role change blocked", expectErr(nosub, "not authorized"), `${nosub.status} ${JSON.stringify(nosub.json)}`)
  const superAdmin = await req("/rest/v1/rpc/set_user_role", {
    method: "POST", token: tokens["superadmin@digimenu.app"], body: { p_uid: target, p_role: "barista" },
  })
  check("superadmin role change bypasses packages", superAdmin.status === 204, superAdmin.status)
  const cross = await req("/rest/v1/rpc/set_user_role", {
    method: "POST", token: tokens["admin@enterprise-cafe.com"], body: { p_uid: users["barista@no-sub-cafe.com"], p_role: "manager" },
  })
  check("cross-cafe role change blocked even with feature", expectErr(cross, "not in your cafe"), `${cross.status} ${JSON.stringify(cross.json)}`)
}

console.log("== D. user_roles column-level update (authenticated) ==")
{
  const target = users["staff@enterprise-cafe.com"]
  const role = await req(`/rest/v1/user_roles?id=eq.${target}`, {
    method: "PATCH", token: tokens["admin@enterprise-cafe.com"], body: { role: "manager" },
  })
  check("role column not updatable via REST", role.status === 403, role.status)
  const lang = await req(`/rest/v1/user_roles?id=eq.${target}`, {
    method: "PATCH", token: tokens["admin@enterprise-cafe.com"], body: { language: "am" },
  })
  check("language column updatable (self-update grant)", lang.status === 200, lang.status)
}

console.log("== E. orders anon read columns ==")
{
  const ok = await req("/rest/v1/orders?select=id,total_amount,order_status,payment_status,items,table_number&limit=1", { token: ANON })
  check("anon CANNOT read orders directly (must use RPC)", ok.status === 401 || ok.status === 403, `expected 401/403, got ${ok.status}`)
  const bad = await req("/rest/v1/orders?select=id,ready_push_sent_at&limit=1", { token: ANON })
  check("anon blocked from non-granted order columns", bad.status === 401 || bad.status === 403, bad.status)
}

console.log("== F. update_staff_order (ordering / kds / cashierPos) ==")
{
  const oid = (await req("/rest/v1/orders?select=id&cafe_slug=eq.babi-shop&limit=1&order=created_at.desc", { admin: true })).json[0].id
  const barista = await req("/rest/v1/rpc/update_staff_order", {
    method: "POST", token: tokens["barista@babi-shop.com"],
    body: { p_order_id: oid, p_changes: { orderStatus: "accepted" } },
  })
  check("starter barista staff-update allowed (ordering)", barista.status === 204, barista.status)
  const nosub = await req("/rest/v1/rpc/update_staff_order", {
    method: "POST", token: tokens["barista@no-sub-cafe.com"],
    body: { p_order_id: oid, p_changes: { orderStatus: "accepted" } },
  })
  check("no-subscription barista staff-update blocked", nosub.status >= 400, `${nosub.status} ${JSON.stringify(nosub.json)}`)
}

console.log("== G. create_staff_user (admin + userManagement) ==")
{
  const ent = await req("/rest/v1/rpc/create_staff_user", {
    method: "POST", token: tokens["admin@enterprise-cafe.com"],
    body: { p_email: "cashier-new@enterprise-cafe.com", p_password: "staffpass123", p_display_name: "New Cashier", p_role: "cashier" },
  })
  const already = expectErr(ent, "already registered")
  check("enterprise admin can create staff", (ent.status === 200 && typeof ent.json === "string") || already, `${ent.status} ${JSON.stringify(ent.json)}`)
  const starter = await req("/rest/v1/rpc/create_staff_user", {
    method: "POST", token: tokens["admin@babi-shop.com"],
    body: { p_email: "cashier-x@babi-shop.com", p_password: "staffpass123", p_display_name: "X", p_role: "cashier" },
  })
  check("starter admin staff-create blocked", expectErr(starter, "not authorized"), `${starter.status} ${JSON.stringify(starter.json)}`)
}

console.log("== H. get_order_push_subscriptions (notifications) ==")
{
  const oid = (await req("/rest/v1/orders?select=id&cafe_slug=eq.enterprise-cafe&limit=1&order=created_at.desc", { admin: true })).json[0].id
  const starter = await req("/rest/v1/rpc/get_order_push_subscriptions", {
    method: "POST", token: tokens["barista@babi-shop.com"], body: { p_order_id: oid },
  })
  check("starter staff push-sub read returns no rows (no notifications)", starter.status === 200 && Array.isArray(starter.json) && starter.json.length === 0, `${starter.status} ${JSON.stringify(starter.json)}`)
  const enterprise = await req("/rest/v1/rpc/get_order_push_subscriptions", {
    method: "POST", token: tokens["staff@enterprise-cafe.com"], body: { p_order_id: oid },
  })
  check("enterprise staff push-sub read allowed", enterprise.status === 200, enterprise.status)
}

console.log("== I. settings / tables writes (settings / tables features) ==")
{
  const billing = await req("/rest/v1/settings?select=tax_rate&id=eq.billing", { admin: true })
  const before = billing.json[0].tax_rate
  const settingsBlocked = await req(`/rest/v1/settings?id=eq.billing`, {
    method: "PATCH", token: tokens["admin@babi-shop.com"], body: { tax_rate: 5 },
  })
  const afterBlocked = (await req("/rest/v1/settings?select=tax_rate&id=eq.billing", { admin: true })).json[0].tax_rate
  check("starter admin settings update blocked (no settings feature)", afterBlocked === before, `before=${before} after=${afterBlocked} status=${settingsBlocked.status}`)
  const settingsOk = await req(`/rest/v1/settings?id=eq.billing`, {
    method: "PATCH", token: tokens["admin@enterprise-cafe.com"], body: { tax_rate: 12 },
  })
  const afterOk = (await req("/rest/v1/settings?select=tax_rate&id=eq.billing", { admin: true })).json[0].tax_rate
  check("enterprise admin settings update allowed", settingsOk.status === 200 && afterOk === 12, `status=${settingsOk.status} after=${afterOk}`)
  const tableBlocked = await req("/rest/v1/tables", {
    method: "POST", token: tokens["admin@babi-shop.com"],
    body: { id: "t-babi-1", cafe_slug: "babi-shop", table_number: 1, label: "T1" },
  })
  check("starter admin table insert blocked (no tables feature)", tableBlocked.status === 403, tableBlocked.status)
  const tableOk = await req("/rest/v1/tables", {
    method: "POST", token: tokens["admin@enterprise-cafe.com"],
    body: { id: `t-ent-${crypto.randomUUID()}`, cafe_slug: "enterprise-cafe", table_number: 1, label: "T1" },
  })
  check("enterprise admin table insert allowed", tableOk.status === 201, tableOk.status)
}

console.log(`\n== ${pass.length} passed, ${fail.length} failed ==`)
if (fail.length > 0) {
  console.log("FAILED:", fail.join(" | "))
  process.exit(1)
}
