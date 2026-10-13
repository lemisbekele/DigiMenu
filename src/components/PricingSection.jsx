import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ArrowRight, Lock, CheckCircle2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { usePlan } from "../context/planContextValue"
import { createSubscriptionRequest } from "../services/subscriptionService"
import { observePackages, observeFeatures } from "../services/packageService"
import { getFeatureInfo } from "../services/planService"
import { Modal } from "./Modal"

export function PricingSection({ lockedFeatureKey = null, headingLevel = 2 }) {
  const { t, i18n } = useTranslation()
  const { plan } = usePlan()
  const [packages, setPackages] = useState(null)
  const [features, setFeatures] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  useEffect(() => {
    setLoadError(false)
    const fail = () => setLoadError(true)
    const stopPackages = observePackages(setPackages, fail)
    const stopFeatures = observeFeatures(setFeatures, fail)
    return () => { stopPackages(); stopFeatures() }
  }, [attempt])
  const catalog = useMemo(() => new Map((features || []).filter(f => f.enabled && getFeatureInfo(f.key)).map(f => [f.key, f])), [features])
  const visible = useMemo(() => (packages || []).filter(p => p.status === "active").sort((a, b) => Number(a.limits?.menuItems || 0) - Number(b.limits?.menuItems || 0) || a.name.localeCompare(b.name)), [packages])
  const included = pkg => [...new Set(pkg.features)].filter(key => catalog.has(key))
  const label = key => t(`features.${key}`, catalog.get(key)?.name || getFeatureInfo(key)?.name || t("pricing.feature", "Requested feature"))
  const comparison = [...new Set(visible.flatMap(included))]
  const selectedPackage = visible.find(p => p.id === selected)
  const open = id => { setSelected(id); setSuccess(false); setError("") }
  const submit = async event => {
    event.preventDefault()
    if (submitting.current || !selectedPackage) return
    const form = new FormData(event.currentTarget)
    if (!String(form.get("contactName") || "").trim()) {
      setError(t("pricing.contactRequired", "Enter the name of the person we should contact about this request."))
      return
    }
    submitting.current = true; setBusy(true); setError("")
    try {
      await createSubscriptionRequest({ customerName: form.get("name"), email: form.get("email"), phone: form.get("phone"), notes: [`Contact person: ${String(form.get("contactName") || "").trim()}`, form.get("location") ? `Location: ${String(form.get("location")).trim()}` : "", String(form.get("notes") || "").trim()].filter(Boolean).join("\n"), planKey: selected })
      setSuccess(true)
    } catch {
      setError(t("pricing.requestError", "Your request could not be submitted. Check your connection and details. If you already have a pending request, please wait for its review."))
    } finally { submitting.current = false; setBusy(false) }
  }
  const Heading = headingLevel === 1 ? "h1" : "h2"
  return <div className="product-pricing">
    <div className="marketing-section-heading"><p className="marketing-eyebrow">{t("marketing.pricing", "Pricing")}</p>
      <Heading className="pricing-title">{t("pricing.title", "The right tools for your next chapter.")}</Heading>
      <p>{t("pricing.copy", "Compare published prices, included features and usage limits. Each plan includes only the features listed below.")}</p>
    </div>
    {lockedFeatureKey && <div className="product-notice"><Lock size={22} /><div><strong>{label(lockedFeatureKey)}</strong><p>{t("pricing.locked", "This feature is not available with your current access. Compare packages below and contact your cafe owner about changes to an existing subscription.")}</p></div></div>}
    {loadError ? <div className="product-empty" role="alert"><p>{t("pricing.loadError", "Plans are temporarily unavailable. Please try again.")}</p><button className="marketing-secondary" onClick={() => setAttempt(attempt + 1)}>{t("refresh")}</button></div>
      : !packages || !features ? <p className="product-empty" role="status">{t("pricing.loading", "Loading published plans…")}</p>
      : !visible.length ? <p className="product-empty">{t("pricing.empty", "No plans are currently open for new requests.")}</p>
      : <>
        <div className="pricing-cards">{visible.map(pkg => <article key={pkg.id} className={`pricing-card ${plan === pkg.id ? "is-current" : ""}`}>
          <div><p className="marketing-eyebrow">{plan === pkg.id ? t("pricing.current", "Current plan") : t("pricing.subscription", "Subscription")}</p><h2>{pkg.name}</h2><p>{pkg.description}</p></div>
          <p className="pricing-amount"><strong>{pkg.price || t("pricing.onRequest", "Price on request")}</strong><span>{pkg.price ? pkg.period : ""}</span></p>
          <button className="primary-button" onClick={() => open(pkg.id)}>{t("pricing.request", "Request {{name}}", { name: pkg.name })}<ArrowRight size={16} /></button>
          <dl className="pricing-limits">{[["menuItems", t("pricing.menuItems", "Menu items")], ["staffUsers", t("pricing.staffUsers", "Staff accounts")]].map(([key, name]) => <div key={key}><dt>{name}</dt><dd>{Number.isInteger(Number(pkg.limits?.[key])) && Number(pkg.limits?.[key]) > 0 ? new Intl.NumberFormat(i18n.resolvedLanguage).format(pkg.limits[key]) : t("pricing.confirmLimit", "Confirm with platform team")}</dd></div>)}</dl>
          <ul className="pricing-features">{included(pkg).map(key => <li key={key}><Check size={17} /><span>{label(key)}</span></li>)}</ul>
        </article>)}</div>
        <p className="pricing-disclosure">{t("pricing.disclosure", "Requests are reviewed before activation. Submitting a request does not take payment, guarantee approval or change an existing subscription. Cafe sales use the cafe’s configured currency; subscription prices are shown as published.")}</p>
        {comparison.length > 0 && <details className="pricing-comparison"><summary>{t("pricing.compare", "Compare every included feature")}</summary><div className="product-table-scroll" tabIndex={0} role="region" aria-label={t("pricing.compare", "Compare every included feature")}>
          <table><thead><tr><th scope="col">{t("pricing.feature", "Feature")}</th>{visible.map(pkg => <th scope="col" key={pkg.id}>{pkg.name}</th>)}</tr></thead><tbody>{comparison.map(key => <tr key={key}><th scope="row">{label(key)}</th>{visible.map(pkg => <td key={pkg.id}>{included(pkg).includes(key) ? t("pricing.included", "Included") : t("pricing.notIncluded", "Not included")}</td>)}</tr>)}</tbody></table>
        </div></details>}
      </>}
    {selected && <Modal title={success ? t("pricing.received", "Request received") : t("pricing.request", "Request {{name}}", { name: selectedPackage?.name || selected })} busy={busy} onClose={() => setSelected(null)}>
      {success ? <div className="request-success" role="status"><CheckCircle2 size={36} /><p>{t("pricing.success", "Your request is saved and awaiting platform review. Account access is arranged after approval; no account or payment has been created by this request.")}</p><button className="primary-button" onClick={() => setSelected(null)}>{t("close")}</button></div>
      : <form className="product-form" onSubmit={submit}>
        <div className="form-context"><strong>{selectedPackage?.name}</strong><span>{selectedPackage?.price || t("pricing.onRequest", "Price on request")} {selectedPackage?.price ? selectedPackage.period : ""}</span></div>
        <p>{t("pricing.formCopy", "Tell us about your cafe. Required fields are marked with an asterisk.")}</p>
        {!selectedPackage && <p role="alert">{t("pricing.changed", "This plan is no longer available. Close this window and choose another plan.")}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <label>{t("pricing.name", "Cafe or organization name")} *<input name="name" autoComplete="organization" maxLength={120} required disabled={busy} /></label>
        <label>{t("pricing.contactName", "Contact person’s name")} *<input name="contactName" autoComplete="name" maxLength={120} required disabled={busy} /></label>
        <label>{t("pricing.email", "Owner email address")} *<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} /></label>
        <label>{t("pricing.phone", "Phone number (optional)")}<input name="phone" type="tel" autoComplete="tel" maxLength={40} disabled={busy} /></label>
        <label>{t("pricing.location", "City and country (optional)")}<input name="location" autoComplete="off" placeholder={t("pricing.locationExample", "e.g. Addis Ababa, Ethiopia")} maxLength={160} disabled={busy} /></label>
        <label>{t("pricing.notes", "Tell us what you need (optional)")}<textarea name="notes" rows={3} maxLength={1500} disabled={busy} /></label>
        <button className="primary-button" type="submit" disabled={busy || !selectedPackage}>{busy ? t("pricing.submitting", "Submitting…") : t("pricing.submit", "Submit request")}</button>
      </form>}
    </Modal>}
  </div>
}
