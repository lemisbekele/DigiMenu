import crypto from "node:crypto"

const BASE = "http://127.0.0.1:54321"
const ANON = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"

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
  return { status: res.status, json, text }
}

async function run() {
  console.log("=== CRITICAL FIX VERIFICATION ===\n")

  // C1: subscription_requests forged active insert
  console.log("C1: Forge active subscription as anon")
  const sub1 = await req("/rest/v1/subscription_requests", {
    method: "POST", token: ANON,
    body: { id: "test-forge-1", plan_key: "enterprise", status: "active", cafe_slug: "babi-shop", email: "attacker@test.com" }
  })
  console.log(`  Insert with status=active: ${sub1.status} ${JSON.stringify(sub1.json)}`)
  if (sub1.status === 201) {
    const check = await req("/rest/v1/subscription_requests?select=status,cafe_slug&id=eq.test-forge-1", { admin: true })
    console.log(`  Stored status: ${check.json?.[0]?.status} (should be pending_approval)`)
  }

  // C2: anon select orders
  console.log("\nC2: Anon SELECT all orders")
  const orders = await req("/rest/v1/orders?select=id,total_amount,customer_name&limit=5", { token: ANON })
  console.log(`  Direct orders select: ${orders.status} (expected 401/403)`)
  if (orders.status === 200) console.log("  ❌ FAIL: anon can read orders!")
  else console.log("  ✓ PASS: anon blocked")

  // C3: update_customer_order tampering
  console.log("\nC3: update_customer_order tampering")
  const orderR = await req("/rest/v1/rpc/create_customer_order", {
    method: "POST", token: ANON,
    body: { p_table_number: "T1", p_items: [{ itemId: "00000000-0000-0000-0000-000000000000", quantity: 1 }] }
  })
  console.log(`  create_customer_order: ${orderR.status} ${JSON.stringify(orderR.json)}`)

  if (orderR.status === 200 && orderR.json) {
    const tamper = await req("/rest/v1/rpc/update_customer_order", {
      method: "POST", token: ANON,
      body: { p_order_id: orderR.json, p_payment_proof_url: "javascript:alert(1)" }
    })
    console.log(`  Tamper proof URL to javascript:: ${tamper.status} ${JSON.stringify(tamper.json)}`)
    if (tamper.status >= 400) console.log("  ✓ PASS: malicious URL rejected")
    else console.log("  ❌ FAIL: malicious URL accepted")

    const ext = await req("/rest/v1/rpc/update_customer_order", {
      method: "POST", token: ANON,
      body: { p_order_id: orderR.json, p_payment_proof_url: "https://evil.com/proof.jpg" }
    })
    console.log(`  Tamper proof URL to external:: ${ext.status} ${JSON.stringify(ext.json)}`)
    if (ext.status >= 400) console.log("  ✓ PASS: external URL rejected")
    else console.log("  ❌ FAIL: external URL accepted")

    const valid = await req("/rest/v1/rpc/update_customer_order", {
      method: "POST", token: ANON,
      body: { p_order_id: orderR.json, p_payment_proof_url: "http://127.0.0.1:54321/storage/v1/object/public/cafe-assets/paymentProofs/test.jpg" }
    })
    console.log(`  Valid storage URL:: ${valid.status} ${JSON.stringify(valid.json)}`)
    if (valid.status === 204) console.log("  ✓ PASS: valid storage URL accepted")
    else console.log("  ❌ FAIL: valid storage URL rejected")
  }

  // C3b: update_customer_order after paid
  console.log("\nC3b: update_customer_order on paid order")
  const paidOrder = await req("/rest/v1/orders?select=id&cafe_slug=eq.enterprise-cafe&limit=1&order=created_at.desc", { admin: true })
  if (paidOrder.json?.[0]?.id) {
    const oid = paidOrder.json[0].id
    await req(`/rest/v1/orders?id=eq.${oid}`, { method: "PATCH", admin: true, body: { payment_status: "paid", order_status: "paid" } })
    const tamperPaid = await req("/rest/v1/rpc/update_customer_order", {
      method: "POST", token: ANON,
      body: { p_order_id: oid, p_payment_method: "cash" }
    })
    console.log(`  Tamper paid order: ${tamperPaid.status} ${JSON.stringify(tamperPaid.json)}`)
    if (tamperPaid.status >= 400) console.log("  ✓ PASS: paid order edits blocked")
    else console.log("  ❌ FAIL: paid order edits allowed")
  }

  console.log("\n=== VERIFICATION COMPLETE ===")
}

run().catch(console.error)