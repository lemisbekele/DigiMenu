import { beforeEach, describe, expect, it } from "vitest"
import {
  assertPlanFeature,
  cacheSubscriptionRequests,
  getActivePlan,
  planHasFeature,
  resolveCafePlanKey,
  setActivePlan,
  cachePackages,
  resolveFeatureKeys,
  isSubscriptionActive,
} from "./planService"

describe("planService", () => {
  it("does not infer tier inheritance or grant inactive/unknown features", () => {
    expect(resolveFeatureKeys("custom", [{ id: "custom", status: "active", features: ["kds", "kds", "notImplemented"] }])).toEqual(["kds"])
    expect(resolveFeatureKeys("custom", [{ id: "custom", status: "inactive", features: ["kds"] }])).toEqual([])
  })
  it("checks expiry even if the subscription status still says active", () => {
    expect(isSubscriptionActive({ status: "active", expired_at: "2020-01-01" })).toBe(false)
    expect(isSubscriptionActive({ status: "active", expired_at: "invalid" })).toBe(false)
    expect(isSubscriptionActive({ status: "approved", expired_at: null })).toBe(true)
  })
  beforeEach(() => {
    localStorage.clear()
    cachePackages([
      { id: "starter", features: ["digitalMenu", "ordering"] },
      { id: "professional", features: ["digitalMenu", "ordering", "staffAccess", "kds", "cashierPos", "menuManagement", "tables", "settings"] },
      { id: "enterprise", features: ["digitalMenu", "ordering", "staffAccess", "kds", "cashierPos", "menuManagement", "tables", "settings", "userManagement", "auditLogs", "multiLanguage"] },
    ])
  })

  it("has no plan when nothing is stored", () => {
    expect(getActivePlan()).toBeNull()
  })

  it("persists and reads the active plan", () => {
    setActivePlan("enterprise")
    expect(getActivePlan()).toBe("enterprise")
    setActivePlan("starter")
    expect(getActivePlan()).toBe("starter")
  })

  it("rejects unknown plans", () => {
    expect(() => setActivePlan("free")).toThrow()
  })

  it("gives every plan digital menu and ordering", () => {
    ;["starter", "professional", "enterprise"].forEach((plan) => {
      expect(planHasFeature("digitalMenu", plan)).toBe(true)
      expect(planHasFeature("ordering", plan)).toBe(true)
    })
  })

  it("restricts staff features to professional and above", () => {
    expect(planHasFeature("kds", "starter")).toBe(false)
    expect(planHasFeature("kds", "professional")).toBe(true)
    expect(planHasFeature("cashierPos", "professional")).toBe(true)
    expect(planHasFeature("staffAccess", "starter")).toBe(false)
  })

  it("restricts audit logs, user management, and multi-language to enterprise", () => {
    ;["starter", "professional"].forEach((plan) => {
      expect(planHasFeature("auditLogs", plan)).toBe(false)
      expect(planHasFeature("userManagement", plan)).toBe(false)
      expect(planHasFeature("multiLanguage", plan)).toBe(false)
    })
    ;["auditLogs", "userManagement", "multiLanguage"].forEach((key) => {
      expect(planHasFeature(key, "enterprise")).toBe(true)
    })
  })

  it("does not grant a feature without a Supabase package snapshot", () => {
    localStorage.removeItem("cafe_packages_cache")
    expect(planHasFeature("digitalMenu", "starter")).toBe(false)
  })
})

describe("resolveCafePlanKey", () => {
  const SUBSCRIPTIONS_KEY = "cafe_subscription_requests"

  function cacheSubscriptions(subs) {
    localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subs))
  }

  beforeEach(() => {
    localStorage.clear()
    cachePackages([{ id: "professional", features: ["kds", "menuManagement"] }, { id: "starter", features: [] }])
  })

  it("resolves the plan from an active subscription", () => {
    cacheSubscriptions([
      { cafe_slug: "acme-cafe", status: "active", plan_key: "professional" },
    ])
    expect(resolveCafePlanKey("acme-cafe")).toBe("professional")
  })

  it("treats approved subscriptions as active", () => {
    cacheSubscriptions([
      { cafe_slug: "acme-cafe", status: "approved", plan_key: "starter" },
    ])
    expect(resolveCafePlanKey("acme-cafe")).toBe("starter")
  })

  it("uses the authenticated subscription snapshot for synchronous guards", () => {
    cacheSubscriptionRequests([
      { cafe_slug: "acme-cafe", status: "ACTIVE", plan_key: "PROFESSIONAL" },
    ])
    expect(resolveCafePlanKey("acme-cafe")).toBe("professional")
  })

  it("ignores pending, rejected and expired subscriptions", () => {
    cacheSubscriptions([
      { cafe_slug: "acme-cafe", status: "pending_approval", plan_key: "enterprise" },
      { cafe_slug: "acme-cafe", status: "rejected", plan_key: "enterprise" },
      { cafe_slug: "acme-cafe", status: "expired", plan_key: "enterprise" },
    ])
    expect(resolveCafePlanKey("acme-cafe")).toBeNull()
  })

  it("returns null when the cafe has no subscription at all", () => {
    cacheSubscriptions([{ cafe_slug: "other-cafe", status: "active", plan_key: "enterprise" }])
    expect(resolveCafePlanKey("acme-cafe")).toBeNull()
  })

  it("does not fall back to the stored plan for unsubscribed cafes", () => {
    setActivePlan("professional")
    expect(resolveCafePlanKey("acme-cafe")).toBeNull()
  })
})

describe("assertPlanFeature", () => {
  const SUBSCRIPTIONS_KEY = "cafe_subscription_requests"

  function cacheSubscriptions(subs) {
    localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subs))
  }

  beforeEach(() => {
    localStorage.clear()
    cachePackages([{ id: "professional", features: ["kds", "menuManagement"] }, { id: "starter", features: [] }])
  })

  it("allows a feature included in the cafe's package", () => {
    cacheSubscriptions([{ cafe_slug: "acme-cafe", status: "active", plan_key: "professional" }])
    expect(() => assertPlanFeature("kds", "acme-cafe")).not.toThrow()
    expect(() => assertPlanFeature("menuManagement", "acme-cafe")).not.toThrow()
  })

  it("rejects a feature outside the cafe's package", () => {
    cacheSubscriptions([{ cafe_slug: "acme-cafe", status: "active", plan_key: "starter" }])
    expect(() => assertPlanFeature("menuManagement", "acme-cafe")).toThrow(/not included/)
    expect(() => assertPlanFeature("userManagement", "acme-cafe")).toThrow(/not included/)
  })

  it("rejects every feature when the cafe has no active subscription", () => {
    expect(() => assertPlanFeature("digitalMenu", "acme-cafe")).toThrow(/no active subscription/)
    expect(() => assertPlanFeature("ordering", "acme-cafe")).toThrow(/no active subscription/)
  })
})
