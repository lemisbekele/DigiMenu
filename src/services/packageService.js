import { toUserMessage } from "./userMessages"
import { supabase } from "./supabase"
import { recordAuditLog } from "./dataService"
import { cachePackages, resolveCachedPackages } from "./planService"

export const PACKAGE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
}

// ---------------------------------------------------------------------------
// Feature catalog — the authoritative list of platform features, stored in
// the `features` Supabase table. Package entitlements (packages.features)
// must reference keys from this catalog. The UI waits for Supabase catalog
// data instead of inventing a feature list while the catalog loads.
// ---------------------------------------------------------------------------
const FEATURES_CACHE_KEY = "cafe_features_cache"

function normalizeFeatureRow(row) {
  if (!row) return null
  return {
    key: row.key,
    name: row.name || row.key,
    description: row.description || "",
    enabled: row.enabled !== false,
    updatedAt: row.updated_at || null,
  }
}

export function getCachedFeatures() {
  try {
    const raw = localStorage.getItem(FEATURES_CACHE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function cacheFeatures(features) {
  try {
    localStorage.setItem(FEATURES_CACHE_KEY, JSON.stringify(features || []))
  } catch {}
}

let featuresFetchPromise = null
let lastFeatureFetchTime = 0

export async function fetchFeatures(force = false) {
  const cached = getCachedFeatures()
  if (!force && cached.length && Date.now() - lastFeatureFetchTime < 30000) return cached
  if (featuresFetchPromise && !force) return featuresFetchPromise

  featuresFetchPromise = (async () => {
    const { data, error } = await supabase.from("features").select("*").order("key")
    if (error) throw new Error(`Could not load the feature catalog from Supabase: ${error.message}`)
    const normalized = (data || []).map(normalizeFeatureRow).filter(Boolean)
    cacheFeatures(normalized)
    lastFeatureFetchTime = Date.now()
    return normalized
  })().finally(() => {
    featuresFetchPromise = null
  })

  return featuresFetchPromise
}

export function observeFeatures(callback, onError) {
  let isSubscribed = true
  let channel = null

  const load = async () => {
    try {
      const data = await fetchFeatures(true)
      if (isSubscribed) callback(data || [])
    } catch (err) {
      if (isSubscribed) onError?.(toUserMessage(err, "Feature catalog could not load."))
    }
  }

  load()

  try {
    const channelName = `features-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "features" }, () => {
        cacheFeatures([])
        load()
      })
      .subscribe()
  } catch {}

  return () => {
    isSubscribed = false
    if (channel) supabase.removeChannel(channel).catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Packages — the single source of truth is the `packages` Supabase table.
// The displayed feature list is exactly what is stored in Supabase; the
// frontend never injects its own feature defaults into a package.
// ---------------------------------------------------------------------------
function normalizePackageRow(row) {
  return {
    id: row?.id,
    name: row?.name || row?.id || "",
    price: row?.price || "",
    period: row?.period || "/month",
    description: row?.description || "",
    features: Array.isArray(row?.features) ? row.features.filter(Boolean) : [],
    status: row?.status || PACKAGE_STATUS.ACTIVE,
    limits: row?.limits || {},
    updated_at: row?.updated_at || null,
  }
}

// Merge real package rows with display defaults (labels/prices only). The
// feature list is never merged — it comes exclusively from Supabase.
export function mergePackageDefaults(rows) {
  return Array.isArray(rows) ? rows : []
}

let packageFetchPromise = null
let lastPackageFetchTime = 0
const PACKAGE_CACHE_TTL = 30000 // 30s cache

export async function fetchPackages(force = false) {
  const now = Date.now()
  const cached = resolveCachedPackages()

  if (!force && cached && cached.length && now - lastPackageFetchTime < PACKAGE_CACHE_TTL) {
    return cached
  }

  if (packageFetchPromise && !force) {
    return packageFetchPromise
  }

  packageFetchPromise = (async () => {
    const { data, error } = await supabase.from("packages").select("*")
    if (error) {
      throw new Error(`Could not load packages from Supabase: ${error.message}`)
    }
    const normalized = mergePackageDefaults((data || []).map(normalizePackageRow))
    cachePackages(normalized)
    lastPackageFetchTime = Date.now()
    return normalized
  })().finally(() => {
    packageFetchPromise = null
  })

  return packageFetchPromise
}

export function getCachedPackages() {
  return resolveCachedPackages()
}

export function observePackages(callback, onError) {
  let isSubscribed = true
  let channel = null

  const load = async (force = false) => {
    try {
      const data = await fetchPackages(force)
      if (isSubscribed) callback(data || [])
    } catch (err) {
      if (isSubscribed) onError?.(toUserMessage(err, "Packages could not load."))
    }
  }

  load()

  try {
    const channelName = `packages-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "packages" }, () => load(true))
      .subscribe()
  } catch {}

  return () => {
    isSubscribed = false
    if (channel) supabase.removeChannel(channel).catch(() => {})
  }
}

async function validateFeatureKeys(features) {
  const keys = Array.isArray(features) ? features.filter(Boolean) : []
  if (!keys.length) return keys
  const catalog = await fetchFeatures(true)
  const known = new Set(catalog.filter((feature) => feature.enabled).map((feature) => feature.key))
  const invalid = keys.filter((key) => !known.has(key))
  if (invalid.length) {
    throw new Error(`These features are not active in the Supabase feature catalog: ${invalid.join(", ")}`)
  }
  return keys
}

export async function savePackage({
  id,
  name,
  price,
  period,
  description,
  features,
  status,
  limits,
}) {
  if (!id) throw new Error("Package id is required.")

  const validFeatures = await validateFeatureKeys(features)
  const normalizedLimits = limits && typeof limits === "object" ? { ...limits } : {}
  for (const [key, label] of [["menuItems", "Menu items"], ["staffUsers", "Staff accounts"]]) {
    const value = Number(normalizedLimits[key])
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${label} limit must be a whole number of at least 1.`)
    }
    normalizedLimits[key] = value
  }

  const payload = {
    id,
    name: (name || "").trim() || id,
    price: (price || "").trim(),
    period: (period || "/month").trim(),
    description: (description || "").trim(),
    features: validFeatures,
    status: status || PACKAGE_STATUS.ACTIVE,
    limits: normalizedLimits,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from("packages").upsert(payload)
  if (error) throw new Error(`Could not save package changes to Supabase: ${error.message}`)

  const fresh = await fetchPackages(true)
  cachePackages(fresh)

  await recordAuditLog("packages.update", {
    id,
    name: payload.name,
    price: payload.price,
    period: payload.period,
    description: payload.description,
    status: payload.status,
    featureCount: payload.features.length,
  }).catch(() => {})

  return payload
}

export async function createPackage(data) {
  const payload = await savePackage({ ...data })
  await recordAuditLog("packages.create", {
    id: payload.id,
    name: payload.name,
    price: payload.price,
  }).catch(() => {})
  return payload
}

export async function setPackageStatus(id, status, actorRole = null) {
  if (!id) throw new Error("Package id is required.")
  if (!Object.values(PACKAGE_STATUS).includes(status)) throw new Error(`Invalid package status: ${status}`)

  if (actorRole) {
    if (actorRole !== "superadmin") {
      throw new Error("Authorization Error: Only Super Admin can activate or deactivate packages.")
    }
  }

  const current = getPackageById(id)
  await savePackage({
    id,
    status,
    name: current?.name,
    price: current?.price,
    period: current?.period,
    description: current?.description,
    features: current?.features,
    limits: current?.limits,
  })

  await recordAuditLog("packages.status.update", { id, status }).catch(() => {})
  return status
}

export function getPackageById(id, packages = getCachedPackages()) {
  return packages.find((p) => p.id === id) || null
}

// Legacy alias kept for callers that only need pricing metadata.
export async function fetchPackageOverrides() {
  const packages = await fetchPackages()
  const overrides = {}
  packages.forEach((p) => {
    overrides[p.id] = {
      price: p.price,
      period: p.period,
      description: p.description,
      features: p.features,
      status: p.status,
      limits: p.limits,
    }
  })
  return overrides
}
