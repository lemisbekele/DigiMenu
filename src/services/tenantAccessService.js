import { supabase } from "./supabase"
import { isSubscriptionActive } from "./planService"

export const TENANT_ACCESS = {
  READY: "ready",
  NOT_FOUND: "not_found",
  INACTIVE: "inactive",
  SUBSCRIPTION_INACTIVE: "subscription_inactive",
  UNAUTHORIZED: "unauthorized",
  UNAVAILABLE: "unavailable",
}


export async function validateTenantAccess({ slug, userId = null, requireStaff = false }) {
  const cleanSlug = String(slug || "").trim().toLowerCase()
  if (!cleanSlug) return { status: TENANT_ACCESS.NOT_FOUND }

  let roleRow = null
  if (requireStaff) {
    if (!userId) return { status: TENANT_ACCESS.UNAUTHORIZED }

    const { data, error } = await supabase
    .from("user_roles")
    .select("id, role, cafe_id, cafe_slug, disabled, must_change_password")
    .eq("id", userId)
    .maybeSingle()

    if (error) return { status: TENANT_ACCESS.UNAVAILABLE, error }
    if (!data || data.disabled) return { status: TENANT_ACCESS.UNAUTHORIZED }
    roleRow = data
  }

  // The profile's cafe_id is authoritative. cafe_slug is supported only for
  // pre-migration accounts and must still resolve to the same cafe record.
  const { data: publicCafes, error: cafeError } = await supabase.rpc("get_public_cafe", { p_cafe_slug: cleanSlug })
  const cafe = publicCafes?.[0]

  if (cafeError) return { status: TENANT_ACCESS.UNAVAILABLE, role: roleRow, error: cafeError }
  if (!cafe || String(cafe.slug || "").toLowerCase() !== cleanSlug) {
    return requireStaff ? { status: TENANT_ACCESS.UNAUTHORIZED, role: roleRow } : { status: TENANT_ACCESS.NOT_FOUND }
  }
  if ((cafe.status || "active").toLowerCase() !== "active") return { status: TENANT_ACCESS.INACTIVE, cafe, role: roleRow }

  if (!requireStaff) return { status: TENANT_ACCESS.READY, cafe }
  const roleMatchesCafe = roleRow.cafe_id
    ? String(roleRow.cafe_id) === String(cafe.id)
    : String(roleRow.cafe_slug || "").toLowerCase() === cleanSlug
  if (!roleMatchesCafe) return { status: TENANT_ACCESS.UNAUTHORIZED, cafe, role: roleRow }

  let { data: subscriptions, error: subscriptionError } = await supabase
    .from("subscription_requests")
    .select("id, status, expired_at, cafe_slug, cafe_id, customer_admin_id")
    .eq("cafe_id", cafe.id)

  // Keep legacy approved records usable while the migration backfills cafe_id.
  // New writes always use cafe_id and never infer tenant ownership from a URL.
  if (!subscriptionError && !(subscriptions || []).length) {
    const legacy = await supabase
      .from("subscription_requests")
      .select("id, status, expired_at, cafe_slug, cafe_id, customer_admin_id")
      .eq("cafe_slug", cleanSlug)
    subscriptions = legacy.data
    subscriptionError = legacy.error
  }

  if (subscriptionError) return { status: TENANT_ACCESS.UNAVAILABLE, cafe, role: roleRow, error: subscriptionError }

  const activeSubscription = (subscriptions || []).find((subscription) =>
    isSubscriptionActive(subscription)
    && (!subscription.cafe_id || String(subscription.cafe_id) === String(cafe.id)),
  )

  if (!activeSubscription) {
    return { status: TENANT_ACCESS.SUBSCRIPTION_INACTIVE, cafe, role: roleRow }
  }

  return { status: TENANT_ACCESS.READY, cafe, role: roleRow, subscription: activeSubscription }
}

export function observeTenantAccess({ slug, userId = null, requireStaff = false }, callback, onError) {
  let cancelled = false
  let channel = null
  let refreshTimer = null
  let fallbackTimer = null

  const load = async () => {
    try {
      const snapshot = await validateTenantAccess({ slug, userId, requireStaff })
      if (!cancelled) callback(snapshot)
    } catch (error) {
      if (!cancelled) {
        onError?.(error)
        callback({ status: TENANT_ACCESS.UNAVAILABLE, error })
      }
    }
  }

  const scheduleLoad = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      load()
    }, 100)
  }

  load()
  fallbackTimer = setInterval(load, 30000)

  try {
    channel = supabase
      .channel(`tenant-access-${slug}-${userId || "public"}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cafes", filter: `slug=eq.${slug}` }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_requests", filter: `cafe_slug=eq.${slug}` }, scheduleLoad)
      // Supabase does not support filters for DELETE change events. Reloading
      // on deletes closes the access window immediately when a subscription
      // is revoked or a cafe is removed.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "cafes" }, scheduleLoad)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "subscription_requests" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: userId ? `id=eq.${userId}` : undefined }, scheduleLoad)
      .subscribe((state) => {
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") load()
      })
  } catch (error) {
    onError?.(error)
  }

  return () => {
    cancelled = true
    if (refreshTimer) clearTimeout(refreshTimer)
    if (fallbackTimer) clearInterval(fallbackTimer)
    if (channel) supabase.removeChannel(channel).catch(() => {})
  }
}
