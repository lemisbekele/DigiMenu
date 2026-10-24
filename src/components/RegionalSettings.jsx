import { toUserMessage } from "../services/userMessages"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { CURRENCIES, currentRegion, saveCafeRegion } from "../services/regionalSettings"

export function RegionalSettings() {
  const { t } = useTranslation()
  const slug = useCafeSlug()
  const [region, setRegion] = useState(currentRegion)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const submit = async event => {
    event.preventDefault(); if (busy) return
    setBusy(true); setNotice(null)
    try { await saveCafeRegion(slug, region); setNotice({ success: true, text: t("region.saved", "Regional settings saved.") }) }
    catch (error) { setNotice({ text: toUserMessage(error, "Regional settings could not be saved. Check your choices and try again.") }) }
    finally { setBusy(false) }
  }
  return <section className="ad-section" aria-labelledby="region-heading">
    <div className="ad-section-head">
      <div>
        <h2 id="region-heading">{t("region.title", "Currency and time zone")}</h2>
        <p>{t("region.help", "Set your cafe’s accounting currency before taking orders. Currency is locked after the first order; changing it never converts menu prices. Reports use your cafe’s time zone.")}</p>
      </div>
    </div>
    <form onSubmit={submit} className="ad-form">
      <div className="ad-fields">
        <label className="ad-field">{t("region.currency", "Accounting currency")}<select value={region.currency} onChange={e => setRegion({ ...region, currency: e.target.value })} disabled={busy}>{CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}</select></label>
        <label className="ad-field">{t("region.timeZone", "Time zone")}<input required list="cafe-time-zones" value={region.timeZone} onChange={e => setRegion({ ...region, timeZone: e.target.value })} disabled={busy} /><datalist id="cafe-time-zones">{(Intl.supportedValuesOf?.("timeZone") || ["Africa/Addis_Ababa","UTC"]).map(zone => <option key={zone} value={zone} />)}</datalist></label>
      </div>
      {notice && <p role={notice.success ? "status" : "alert"} className={notice.success ? "ad-success" : "form-error"}>{notice.text}</p>}
      <div><button type="submit" disabled={busy} className="oc-quiet">{busy ? t("region.saving", "Saving…") : t("region.save", "Save regional settings")}</button></div>
    </form>
  </section>
}
