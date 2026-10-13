import { Link } from "react-router-dom"
import { Lock, ArrowRight } from "lucide-react"
import { usePlan } from "../context/planContextValue"
import { getFeatureInfo } from "../services/planService"
import { BrandLogo } from "./BrandLogo"

export function FeatureLockedPage({ feature }) {
  const { plan, planMeta } = usePlan()
  const info = getFeatureInfo(feature)

  return (
    <main className="auth-page">
      <div className="auth-card" style={{ maxWidth: 460, textAlign: "center" }}>
        <BrandLogo size="medium" style={{ justifyContent: "center", marginBottom: 16 }} />
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 16px",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "#fff7e8",
            color: "#835514",
          }}
        >
          <Lock size={26} />
        </div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>Feature not included</h1>
        {plan ? (
          <p style={{ color: "var(--text-2)", marginBottom: 12, lineHeight: 1.6 }}>
            <strong>{info?.name || feature}</strong> is not part of your current{" "}
            <strong>{planMeta?.label || plan}</strong> package.
          </p>
        ) : (
          <p style={{ color: "var(--text-2)", marginBottom: 12, lineHeight: 1.6 }}>
            <strong>{info?.name || feature}</strong> requires an active subscription for this cafe.
          </p>
        )}
        {info?.description ? (
          <p style={{ color: "var(--text-2)", fontSize: "0.92rem", marginBottom: 16, lineHeight: 1.6 }}>
            {info.description}
          </p>
        ) : null}
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            marginBottom: 18,
            textAlign: "left",
            fontSize: "0.9rem",
            color: "var(--text-2)",
          }}
        >
          Ask your cafe owner to arrange a package change with the platform team.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to={`/pricing?locked=${encodeURIComponent(feature)}`} className="primary-button" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Compare packages <ArrowRight size={16} />
          </Link>
          <Link to="/" className="ghost-button" style={{ display: "inline-flex", alignItems: "center" }}>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}

export function PlanGate({ feature, fallback = null, children }) {
  const { hasFeature } = usePlan()
  if (!hasFeature(feature)) return fallback
  return children
}

export function PlanRoute({ feature, children }) {
  const { hasFeature, subscriptionStatus } = usePlan()
  if (subscriptionStatus === "unavailable") return <main className="auth-page"><div className="auth-card"><h1>Access could not be verified</h1><p>Package information is temporarily unavailable. Please try again.</p><button type="button" className="primary-button" onClick={() => window.location.reload()}>Try again</button></div></main>
  if (subscriptionStatus === "loading") {
    return (
      <main className="page-pad splash-loader-container" style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <div className="skeleton-pulse" style={{ width: 120, height: 4, borderRadius: 2 }} />
      </main>
    )
  }
  if (!hasFeature(feature)) {
    return <FeatureLockedPage feature={feature} />
  }
  return children
}
