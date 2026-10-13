import { toUserMessage } from "./userMessages"
import { supabase } from "./supabase"
import { recordAuditLog } from "./dataService"

export function slugify(text) {
  if (!text) return "cafe"
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, "-") // Replace spaces & non-word chars with -
    .replace(/^-+|-+$/g, "") // Trim leading/trailing hyphens
}

export async function fetchRegisteredCafes() {
  const { data, error } = await supabase
    .from("cafes")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`Could not load cafes from Supabase: ${error.message}`)
  return data || []
}

export function observeRegisteredCafes(callback, onError) {
  let isSubscribed = true
  let channel = null
  let refreshTimer = null

  const load = async () => {
    try {
      const data = await fetchRegisteredCafes()
      if (isSubscribed) callback(data || [])
    } catch (err) {
      if (isSubscribed) onError?.(toUserMessage(err, "Cafes could not load."))
    }
  }

  const scheduleLoad = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      load()
    }, 120)
  }

  load()

  try {
    const channelName = `cafes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "cafes" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_requests" }, scheduleLoad)
      .subscribe()
  } catch {}

  return () => {
    isSubscribed = false
    if (refreshTimer) clearTimeout(refreshTimer)
    if (channel) supabase.removeChannel(channel).catch(() => {})
  }
}

export async function ensureUniqueSlug(baseName) {
  const baseSlug = slugify(baseName) || "cafe"
  const existing = await fetchRegisteredCafes()
  let slug = baseSlug
  let counter = 1

  while (existing.some((c) => c?.slug?.toLowerCase() === slug.toLowerCase())) {
    counter++
    slug = `${baseSlug}-${counter}`
  }

  return slug
}

export async function createCafe({ name, ownerEmail, subscriptionId }) {
  if (!name || !name.trim()) throw new Error("Cafe name is required.")

  const cleanName = name.trim()
  const slug = await ensureUniqueSlug(cleanName)
  const cafeId = `cafe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const newCafe = {
    id: cafeId,
    name: cleanName,
    slug,
    owner_email: (ownerEmail || "").trim().toLowerCase(),
    subscription_id: subscriptionId || null,
    status: "active",
    created_at: new Date().toISOString(),
  }

  const { error } = await supabase.from("cafes").insert([newCafe])
  if (error) {
    throw new Error(`Cafe could not be created in Supabase: ${error.message}`)
  }

  await recordAuditLog("cafe.create", {
    cafeId,
    name: cleanName,
    slug,
    ownerEmail,
  }).catch(() => {})

  return newCafe
}

export async function getCafeBySlug(slug) {
  const cleanSlug = slug.trim().toLowerCase()
  if (!cleanSlug) return null
  const { data, error } = await supabase.from("cafes").select("*").eq("slug", cleanSlug).maybeSingle()
  if (error) throw new Error(`Could not load cafe from Supabase: ${error.message}`)
  return data || null
}

export async function updateCafeStatus(cafeId, status) {
  const valid = ["active", "suspended", "pending", "rejected"]
  if (!valid.includes(status)) throw new Error(`Invalid cafe status: ${status}`)

  const cafes = await fetchRegisteredCafes()
  const cafe = cafes.find((c) => c.id === cafeId)
  if (!cafe) throw new Error("Cafe not found.")

  const updated = { ...cafe, status, status_updated_at: new Date().toISOString() }
  const { error } = await supabase.from("cafes").update({ status, status_updated_at: updated.status_updated_at }).eq("id", cafeId)
  if (error) throw error

  await recordAuditLog("cafe.status.update", {
    cafeId,
    name: cafe.name,
    slug: cafe.slug,
    status,
  }).catch(() => {})

  return updated
}

export async function updateCafeOwnerEmail(cafeId, ownerEmail) {
  const cleanEmail = (ownerEmail || "").trim().toLowerCase()
  const cafes = await fetchRegisteredCafes()
  const cafe = cafes.find((c) => c.id === cafeId)
  if (!cafe) throw new Error("Cafe not found.")

  const updated = { ...cafe, owner_email: cleanEmail }
  const { error } = await supabase.from("cafes").update({ owner_email: cleanEmail }).eq("id", cafeId)
  if (error) throw error

  await recordAuditLog("cafe.owner.update", {
    cafeId,
    name: cafe.name,
    ownerEmail: cleanEmail,
  }).catch(() => {})

  return updated
}

export async function deleteCafe(cafeId) {
  const cafes = await fetchRegisteredCafes()
  const cafe = cafes.find((entry) => entry.id === cafeId)
  if (!cafe) throw new Error("Cafe not found.")

  // Server-side deletion through the delete-cafe Edge Function. The function
  // runs with the service-role key (never exposed to the browser), removes
  // the cafe's storage files, deletes every cafe-scoped record plus the
  // Supabase Auth accounts of the owner and staff, and verifies the result.
  const { data, error } = await supabase.functions.invoke("delete-cafe", { body: { cafeId } })
  if (error) {
    throw new Error(`Cafe could not be deleted: ${error.message}`)
  }
  if (!data?.success) {
    throw new Error(data?.error || "Cafe deletion failed on the server. No changes were reported.")
  }

  await recordAuditLog("cafe.delete", {
    cafeId,
    name: cafe.name,
    slug: cafe.slug,
    filesRemoved: data.filesRemoved,
    cleanupPending: Boolean(data.cleanupPending),
    summary: data.summary || null,
  }).catch(() => {})

  return { cafe, summary: data.summary || null, filesRemoved: data.filesRemoved || 0, cleanupPending: Boolean(data.cleanupPending) }
}
