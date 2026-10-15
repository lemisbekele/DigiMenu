import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { PlanContext } from "./planContextValue"
import {
  cacheSubscriptionRequests,
  clearCachedSubscriptionRequests,
  resolveFeatureKeys,
  resolvePlanMeta,
  setActivePlan as persistPlan,
  setCurrentCafeSlug,
  isSubscriptionActive,
} from "../services/planService"
import {
  invalidateSubscriptionRequestCache,
  observeSubscriptionRequests,
} from "../services/subscriptionService"
import { observePackages, observeFeatures, getCachedPackages, getCachedFeatures } from "../services/packageService"
import { supabase } from "../services/supabase"
import { useAuth } from "./authContextValue"

function cafeSlugFromPath(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean)
  if (!parts.length) return null
  const first = parts[0].toLowerCase()
  if (["superadmin", "login", "reset-password", "pricing", "portfolio", "404", "admin"].includes(first)) return null
  return first
}

export function PlanProvider({ children }) {
  const location = useLocation()
  const { user } = useAuth()
  const userId = user?.id || null
  const cafeSlug = cafeSlugFromPath(location.pathname)
  const [plan, setPlanState] = useState(null)
  const [packages, setPackages] = useState(getCachedPackages)
  const [subscriptionStatus, setSubscriptionStatus] = useState("loading")
  const [enabledFeatures, setEnabledFeatures] = useState(() => {
    const cached = getCachedFeatures()
    return cached.length ? cached.filter(f => f.enabled).map(f => f.key) : null
  })
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [catalogError, setCatalogError] = useState(false)
  const lastAuthRef = useRef({ cafeSlug: null, userId: null })

  useEffect(() => observeFeatures(list => setEnabledFeatures(list.filter(f => f.enabled).map(f => f.key)), () => { setEnabledFeatures([]); setCatalogError(true) }), [])

  // Keep the service-layer guard in sync with the cafe context.
  useEffect(() => {
    if (cafeSlug) setCurrentCafeSlug(cafeSlug)
  }, [cafeSlug])

  // Real package catalog — features are the source of truth for entitlements.
  useEffect(() => {
    let isMounted = true
    const unsub = observePackages((list) => {
      if (isMounted) { setPackages(list || []); setCatalogLoaded(true); setCatalogError(false) }
    }, () => { if (isMounted) { setPackages([]); setCatalogLoaded(true); setCatalogError(true) } })
    return () => {
      isMounted = false
      unsub?.()
    }
  }, [])

  // The cafe's plan comes from its ACTIVE subscription (approved/active).
  // Re-resolve whenever AUTH CHANGES: subscription_requests are only readable
  // by authenticated users (RLS), so the anonymous snapshot is always empty —
  // without this refetch every plan gate stays locked until a hard refresh
  // after sign-in.
  useEffect(() => {
    let isMounted = true

    const finishWithPlanKey = (planKey) => {
      if (!isMounted) return
      if (!cafeSlug) {
        setSubscriptionStatus("no-cafe")
        return
      }
      // Catalog still loading? Wait for it instead of declaring "no plan" —
      // package identity is only knowable once the catalog is present.
      if (planKey && !catalogLoaded) {
        setSubscriptionStatus("loading")
        return
      }
      if (planKey && (packages || []).some((p) => p?.id === planKey && p.status !== "inactive")) {
        setPlanState(planKey)
        // The cache write validates against the package snapshot and can
        // throw while that snapshot is briefly stale — never fail the
        // realtime pipeline because of it.
        try {
          persistPlan(planKey)
        } catch {}
        setSubscriptionStatus("active")
      } else {
        // No real subscription for this cafe — no plan, no features.
        setPlanState(null)
        setSubscriptionStatus("none")
      }
    }

    // Drop both caches so no fetch can be served a stale snapshot that
    // belongs to another auth state.
    const authStateChanged = lastAuthRef.current.cafeSlug !== cafeSlug || lastAuthRef.current.userId !== userId
    if (authStateChanged) {
      lastAuthRef.current = { cafeSlug, userId }
      invalidateSubscriptionRequestCache()
      clearCachedSubscriptionRequests()
      setSubscriptionStatus("loading")
      setPlanState(null)
    }
    if (!cafeSlug) { setSubscriptionStatus("no-cafe"); return () => { isMounted = false } }

    if (!userId && cafeSlug) {
      // Anonymous visitor: entitlements come from the public active-plan
      // lookup RPC (subscription rows themselves are RLS-protected).
      const loadPublicPlan = () => supabase
        .rpc("get_active_cafe_plan", { p_cafe_slug: cafeSlug.toLowerCase() })
        .then(({ data }) => {
          const planKey = data ? String(data).toLowerCase() : null
          if (planKey) {
            cacheSubscriptionRequests([
              {
                cafe_slug: cafeSlug.toLowerCase(),
                plan_key: planKey,
                status: "active",
              },
            ])
          }
          finishWithPlanKey(planKey)
        })
        .catch(() => finishWithPlanKey(null))
      loadPublicPlan()
      return () => {
        isMounted = false
      }
    }

    const unsub = observeSubscriptionRequests((requests) => {
      if (!isMounted) return
      if (!cafeSlug) {
        setSubscriptionStatus("no-cafe")
        return
      }
      const active = (requests || []).find(
        (r) =>
          isSubscriptionActive(r) &&
          (r.cafe_slug || "").toLowerCase() === cafeSlug.toLowerCase(),
      )
      finishWithPlanKey(active?.plan_key || null)
    }, null, () => finishWithPlanKey(null))
    return () => {
      isMounted = false
      unsub?.()
    }
  }, [cafeSlug, packages, userId, catalogLoaded])

  const hasFeature = useCallback(
    (featureKey) => {
      const effective = resolveFeatureKeys(plan, packages)
      return !catalogError && effective.includes(featureKey) && (enabledFeatures || []).includes(featureKey)
    },
    [plan, packages, enabledFeatures, catalogError],
  )

  const value = useMemo(
    () => ({
      plan,
      hasFeature,
      planMeta: resolvePlanMeta(plan, packages),
      allPlans: packages,
      packages,
      subscriptionStatus: catalogError ? "unavailable" : enabledFeatures === null && cafeSlug ? "loading" : subscriptionStatus,
      cafeSlug,
    }),
    [plan, hasFeature, packages, subscriptionStatus, cafeSlug, catalogError, enabledFeatures],
  )

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}
