import { supabase } from "./supabase"
import { recordAuditLog } from "./dataService"
import { cacheSubscriptionRequests } from "./planService"

export const SUBSCRIPTION_STATUS = {
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
  ACTIVE: "active",
  EXPIRED: "expired",
}

export const SUBSCRIPTION_STATUS_LABELS = {
  [SUBSCRIPTION_STATUS.PENDING_APPROVAL]: "Pending Approval",
  [SUBSCRIPTION_STATUS.APPROVED]: "Approved",
  [SUBSCRIPTION_STATUS.REJECTED]: "Rejected",
  [SUBSCRIPTION_STATUS.ACTIVE]: "Active",
  [SUBSCRIPTION_STATUS.EXPIRED]: "Expired",
}

export function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower = "abcdefghijkmnopqrstuvwxyz"
  const nums = "23456789"
  const spec = "!@#$%^&*"

  let pass = ""
  const pick = (alphabet) => alphabet[crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length]
  for (let i = 0; i < 5; i++) pass += pick(chars)
  for (let i = 0; i < 5; i++) pass += pick(lower)
  for (let i = 0; i < 4; i++) pass += pick(nums)
  pass += pick(spec)
  return pass
}

export async function createSubscriptionRequest({ customerName, email, phone, planKey, notes }) {
  if (!customerName || !customerName.trim()) throw new Error("Customer/Organization name is required.")
  if (!email || !email.trim() || !email.includes("@")) throw new Error("A valid email (e.g. Gmail) is required.")
  if (!planKey) throw new Error("Subscription plan selection is required.")

  const cleanEmail = email.trim().toLowerCase()
  const cleanName = customerName.trim()
  const cleanPhone = (phone || "").trim()
  const cleanNotes = (notes || "").trim()

  const newReq = {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    customer_name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    plan_key: planKey,
    notes: cleanNotes,
    status: SUBSCRIPTION_STATUS.PENDING_APPROVAL,
    requested_at: new Date().toISOString(),
    approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    customer_admin_id: null,
  }

  const { error } = await supabase.from("subscription_requests").insert([newReq])
  if (error) {
    throw new Error(`Could not submit the subscription request to Supabase: ${error.message}`)
  }

  subRequestsCache.clear()

  await recordAuditLog("subscription.request.create", {
    id: newReq.id,
    customerName: cleanName,
    email: cleanEmail,
    planKey,
  }).catch(() => {})

  return newReq
}

export async function assignPackageToCafe({ cafeSlug, planKey, actorRole = null }) {
  await verifySuperAdminAuthority(actorRole)

  if (!planKey) throw new Error("Package selection is required.")
  if (!cafeSlug || !cafeSlug.trim()) throw new Error("A cafe slug is required to assign a package.")

  const { fetchRegisteredCafes } = await import("./cafeService")
  const cafes = await fetchRegisteredCafes()
  const cleanSlug = cafeSlug.trim().toLowerCase()
  const cafe = cafes.find((c) => (c.slug || "").toLowerCase() === cleanSlug)
  if (!cafe) throw new Error("Choose an existing cafe.")

  const allRequests = await fetchSubscriptionRequests(null, true)
  const belongsToCafe = r => (r.cafe_slug || "").toLowerCase() === cleanSlug || (r.cafe_id || "") === cafe.id
  const existing = allRequests.find(r => belongsToCafe(r) && [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.APPROVED].includes(r.status)) || allRequests.find(belongsToCafe)

  const now = new Date().toISOString()
  const record = {
    id: existing?.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    customer_name: cafe?.name || cleanSlug,
    email: cafe?.owner_email || "",
    phone: "",
    plan_key: planKey,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    notes: "Assigned by Super Admin",
    requested_at: existing?.requested_at || now,
    activated_at: now,
    approved_at: now,
    cafe_id: cafe?.id || null,
    cafe_slug: cleanSlug,
  }

  if (existing) {
    const { error } = await supabase
        .from("subscription_requests")
        .update({
          plan_key: planKey,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          activated_at: now,
          expired_at: null,
          updated_at: now,
          cafe_id: cafe?.id || null,
          cafe_slug: cleanSlug,
        })
        .eq("id", existing.id)
    if (error) throw new Error(`Could not assign package in Supabase: ${error.message}`)
  } else {
    const { error } = await supabase.from("subscription_requests").insert([record])
    if (error) throw new Error(`Could not create package assignment in Supabase: ${error.message}`)
  }
  subRequestsCache.clear()

  await recordAuditLog("subscription.package.assign", {
    id: record.id,
    cafeSlug: cleanSlug,
    cafeName: cafe?.name || cleanSlug,
    planKey,
  }).catch(() => {})

  return record
}

const inFlightSubRequests = new Map()
const subRequestsCache = new Map()
const SUB_CACHE_TTL = 3000
let cacheGeneration = 0

// The in-memory cache must be dropped at auth boundaries: an anonymous fetch
// legitimately returns zero tenant rows (RLS), and serving that cached
// snapshot after sign-in would keep every plan gate locked.
export function invalidateSubscriptionRequestCache() {
  cacheGeneration++
  subRequestsCache.clear()
  inFlightSubRequests.clear()
}

export async function fetchSubscriptionRequests(statusFilter = null, force = false) {
  const generation = cacheGeneration
  const cacheKey = statusFilter || "__all__"
  const now = Date.now()
  const cached = subRequestsCache.get(cacheKey)

  if (!force && cached && now - cached.time < SUB_CACHE_TTL) {
    return cached.data
  }

  if (!force && inFlightSubRequests.has(cacheKey)) {
    return inFlightSubRequests.get(cacheKey)
  }

  const promise = (async () => {
    let query = supabase.from("subscription_requests").select("*").order("requested_at", { ascending: false })
    if (statusFilter) query = query.eq("status", statusFilter)
    const { data, error } = await query
    if (error) throw new Error(`Could not load subscription requests from Supabase: ${error.message}`)
    const result = data || []
    if (generation !== cacheGeneration) return []
    subRequestsCache.set(cacheKey, { data: result, time: Date.now() })
    // Keep synchronous feature checks aligned with the latest authenticated
    // Supabase result. Only the unfiltered tenant snapshot is complete.
    if (!statusFilter) cacheSubscriptionRequests(result)
    return result
  })().finally(() => {
    if (generation === cacheGeneration) inFlightSubRequests.delete(cacheKey)
  })

  inFlightSubRequests.set(cacheKey, promise)
  return promise
}

export function observeSubscriptionRequests(callback, statusFilter = null, onError) {
  let isSubscribed = true
  let channel = null

  const load = async () => {
    try {
      const data = await fetchSubscriptionRequests(statusFilter)
      if (isSubscribed) callback(data)
    } catch {
      if (isSubscribed) { callback([]); onError?.("Subscriptions could not load. Please try again.") }
    }
  }

  load()

  try {
    const channelName = `subscription-requests-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_requests" }, () => {
        subRequestsCache.clear()
        load()
      })
      .subscribe()
  } catch (err) {
    console.warn("Failed to subscribe to subscription_requests realtime:", err)
  }

  return () => {
    isSubscribed = false
    if (channel) supabase.removeChannel(channel).catch(() => {})
  }
}

export async function verifySuperAdminAuthority(providedRole = null) {
  if (providedRole) {
    if (providedRole !== "superadmin") {
      throw new Error("Authorization Error: Only Super Admin can approve, reject, or grant subscription packages.")
    }
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const sessionUser = sessionData?.session?.user
    if (!sessionUser) {
      throw new Error("Authentication Required: Please sign in as Super Admin.")
    }

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role, disabled")
      .eq("id", sessionUser.id)
      .maybeSingle()

    if (roleRow?.role !== "superadmin" || roleRow.disabled) {
      throw new Error("Authorization Error: Only Super Admin can approve, reject, or grant subscription packages.")
    }
  } catch (err) {
    if (err.message && err.message.includes("Authorization Error")) throw err
    if (err.message && err.message.includes("Authentication Required")) throw err
    throw new Error("Authorization Error: Only Super Admin can approve, reject, or grant subscription packages.")
  }

  return true
}

function validateTemporaryPassword(password) {
  const value = String(password || "")
  if (value.length < 12) return "Temporary password must be at least 12 characters long."
  if (!/[A-Z]/.test(value)) return "Temporary password must contain at least one uppercase letter."
  if (!/[a-z]/.test(value)) return "Temporary password must contain at least one lowercase letter."
  if (!/[0-9]/.test(value)) return "Temporary password must contain at least one number."
  if (!/[!@#$%^&*]/.test(value)) return "Temporary password must contain at least one special character."
  return null
}

function cleanProvisionError(raw) {
  const str = typeof raw === "string" ? raw : raw?.message || ""
  if (/already has an account/i.test(str)) return "This email already has an account. Use a different owner email."
  if (/Temporary password/i.test(str)) return "Temporary password must contain 12 to 128 characters."
  if (/active package/i.test(str)) return "Choose an active package."
  if (/pending request/i.test(str)) return "Only a pending request can be approved."
  if (/Not authorized/i.test(str)) return "Authorization Error: Only Super Admin can approve, reject, or grant subscription packages."
  if (/A valid owner email/i.test(str)) return "A valid owner email is required."
  return str.replace(/^Could not provision the cafe owner:\s*/, "") || "Unable to provision this request."
}

export async function approveSubscriptionRequest(requestId, customTempPassword = null, actorRole = null) {
  await verifySuperAdminAuthority(actorRole)

  const allRequests = await fetchSubscriptionRequests(null, true)
  const req = allRequests.find((r) => r.id === requestId)
  if (!req) throw new Error("Subscription request not found.")

  // Security Check: Prevent duplicate approvals & account creations
  if (req.status === SUBSCRIPTION_STATUS.APPROVED || req.status === SUBSCRIPTION_STATUS.ACTIVE) {
    throw new Error("This subscription request has already been approved.")
  }

  const temporaryPassword = customTempPassword || generateTemporaryPassword()
  const passwordError = validateTemporaryPassword(temporaryPassword)
  if (passwordError) throw new Error(passwordError)
  const email = String(req.email || "").trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("The request must contain a valid customer email address before it can be approved.")
  }

  let provisioned = null
  let provisionError = null

  try {
    const res = await supabase.functions.invoke("provision-cafe-owner", {
      body: { requestId, temporaryPassword },
    })
    provisioned = res.data
    provisionError = res.error
  } catch (err) {
    provisionError = err
  }

  // If the Edge Function is unavailable (e.g. 404 NOT_FOUND / not deployed)
  // or returned an error, execute the atomic SECURITY DEFINER database procedure directly.
  if ((provisionError || !provisioned?.cafe || !provisioned?.userId) && typeof supabase.rpc === "function") {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("provision_cafe_owner", {
        p_request_id: requestId,
        p_password: temporaryPassword,
      })
      if (!rpcError && rpcData?.cafe && rpcData?.userId) {
        provisioned = rpcData
        provisionError = null
      } else if (rpcError) {
        provisionError = rpcError
      }
    } catch (rpcErr) {
      if (!provisionError) provisionError = rpcErr
    }
  }

  if (provisionError || !provisioned?.cafe || !provisioned?.userId) {
    throw new Error(cleanProvisionError(provisionError?.message || provisioned?.error || "no result returned"))
  }
  const customerAdminId = provisioned.userId
  const cafeRecord = provisioned.cafe
  const now = provisioned.approvedAt || new Date().toISOString()
  const updatedReq = {
    ...req,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    approved_at: now,
    customer_admin_id: customerAdminId,
    cafe_id: cafeRecord.id,
    cafe_slug: cafeRecord.slug,
  }

  subRequestsCache.clear()

  // Audit Logging
  await recordAuditLog("subscription.request.approve", {
    id: requestId,
    email,
    customerName: req.customer_name,
    planKey: req.plan_key,
  }).catch(() => {})

  await recordAuditLog("subscription.account.create", {
    id: customerAdminId,
    email,
    role: "admin",
    temporaryPasswordGenerated: true,
  }).catch(() => {})

  return {
    success: true,
    requestId,
    request: updatedReq,
    credentials: {
      email,
      temporaryPassword,
      role: "admin",
      mustChangePassword: true,
      cafeSlug: cafeRecord.slug,
    },
  }
}

export async function rejectSubscriptionRequest(requestId, reason = "", actorRole = null) {
  await verifySuperAdminAuthority(actorRole)

  const allRequests = await fetchSubscriptionRequests(null, true)
  const req = allRequests.find((r) => r.id === requestId)
  if (!req) throw new Error("Subscription request not found.")

  const now = new Date().toISOString()
  const updatedReq = {
    ...req,
    status: SUBSCRIPTION_STATUS.REJECTED,
    rejected_at: now,
    rejection_reason: reason || "Request declined by administrator.",
  }

  const { error } = await supabase
    .from("subscription_requests")
    .update({
      status: SUBSCRIPTION_STATUS.REJECTED,
      rejected_at: now,
      rejection_reason: reason || "Request declined by administrator.",
    })
    .eq("id", requestId)
  if (error) throw new Error(`Could not reject subscription request: ${error.message}`)
  subRequestsCache.clear()

  await recordAuditLog("subscription.request.reject", {
    id: requestId,
    email: req.email,
    reason,
  }).catch(() => {})

  return updatedReq
}

export async function updateSubscriptionStatus(requestId, status, actorRole = null) {
  await verifySuperAdminAuthority(actorRole)

  const valid = [
    SUBSCRIPTION_STATUS.PENDING_APPROVAL,
    SUBSCRIPTION_STATUS.APPROVED,
    SUBSCRIPTION_STATUS.REJECTED,
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.EXPIRED,
  ]
  if (!valid.includes(status)) throw new Error(`Invalid subscription status: ${status}`)

  const allRequests = await fetchSubscriptionRequests()
  const req = allRequests.find((r) => r.id === requestId)
  if (!req) throw new Error("Subscription request not found.")

  const now = new Date().toISOString()
  const updatedReq = {
    ...req,
    status,
    updated_at: now,
    ...(status === SUBSCRIPTION_STATUS.APPROVED ? { approved_at: now } : {}),
    ...(status === SUBSCRIPTION_STATUS.REJECTED ? { rejected_at: now } : {}),
    ...(status === SUBSCRIPTION_STATUS.EXPIRED ? { expired_at: now } : {}),
    ...(status === SUBSCRIPTION_STATUS.ACTIVE ? { activated_at: now, expired_at: null } : {}),
  }

  const patch = { status, updated_at: now }
  if (status === SUBSCRIPTION_STATUS.APPROVED) patch.approved_at = now
  if (status === SUBSCRIPTION_STATUS.REJECTED) patch.rejected_at = now
  if (status === SUBSCRIPTION_STATUS.EXPIRED) patch.expired_at = now
  if (status === SUBSCRIPTION_STATUS.ACTIVE) {
    patch.activated_at = now
    patch.expired_at = null
  }
  const { error } = await supabase.from("subscription_requests").update(patch).eq("id", requestId)
  if (error) throw new Error(`Could not update subscription status: ${error.message}`)
  subRequestsCache.clear()

  await recordAuditLog("subscription.status.update", {
    id: requestId,
    email: req.email,
    customerName: req.customer_name,
    status,
  }).catch(() => {})

  return updatedReq
}
