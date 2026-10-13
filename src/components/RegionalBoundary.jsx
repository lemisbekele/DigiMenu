import { useEffect, useState } from "react"
import { fetchCafeRegion } from "../services/regionalSettings"
import { useTranslation } from "react-i18next"

export function RegionalBoundary({ slug, children }) {
  const { t } = useTranslation()
  const [state, setState] = useState({ slug: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    const load = () => fetchCafeRegion(slug).then(() => { if (live) setState({ slug, ready: true }) }).catch(() => { if (live) setState({ slug, error: true }) })
    load()
    window.addEventListener("cafe-region-updated", load)
    return () => { live = false; window.removeEventListener("cafe-region-updated", load) }
  }, [slug, attempt])
  if (state.slug === slug && state.error) return <div className="page-pad" role="alert"><p>{t("region.loadError", "Cafe settings could not load.")}</p><button className="primary-button" onClick={() => setAttempt(attempt + 1)}>{t("refresh")}</button></div>
  if (state.slug !== slug || !state.ready) return <div className="page-pad" role="status">{t("region.loading", "Loading cafe settings…")}</div>
  return children
}
