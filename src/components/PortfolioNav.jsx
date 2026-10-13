import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu, X, ArrowUp } from "lucide-react"
import { BrandLogo } from "./BrandLogo"
import { useTranslation } from "react-i18next"
import { LanguageToggle } from "./LanguageToggle"

export function PortfolioNavbar() {
  const [open, setOpen] = useState(false)
  const { pathname, hash } = useLocation()
  const { t } = useTranslation()
  useEffect(() => {
    setOpen(false)
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" })
    else window.scrollTo({ top: 0 })
  }, [pathname, hash])
  return <>
    <a className="skip-link" href="#main">{t("marketing.skip", "Skip to content")}</a>
    <header className="marketing-header"><div className="marketing-container marketing-nav">
      <Link to="/" className="marketing-brand" aria-label="DigiMenu home"><BrandLogo size="small" /></Link>
      <nav id="marketing-navigation" className={`marketing-links ${open ? "is-open" : ""}`} aria-label={t("marketing.navigation", "Main navigation")}>
        <Link to="/#product">{t("marketing.product", "Product")}</Link>
        <Link to="/pricing" aria-current={pathname === "/pricing" ? "page" : undefined}>{t("marketing.pricing", "Pricing")}</Link>
        <Link to="/#contact">{t("marketing.getStarted", "Get started")}</Link>
        <Link to="/login">{t("marketing.signIn", "Sign in")}</Link>
      </nav>
      <div className="marketing-nav-actions"><LanguageToggle inline publicSite />
        <button className="marketing-menu-button" type="button" aria-controls="marketing-navigation" aria-expanded={open}
          aria-label={t("marketing.navigation", "Main navigation")} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
    </div></header>
  </>
}

export function PortfolioFooter() {
  const { t } = useTranslation()
  return <footer className="marketing-footer"><div className="marketing-container">
    <div className="marketing-footer-grid"><div><Link to="/" className="marketing-brand" aria-label="DigiMenu home"><BrandLogo size="small" /></Link>
      <p>{t("marketing.footerCopy", "A connected workspace for your cafe, from the first order to the last payment.")}</p></div>
      <nav aria-label={t("marketing.footerNavigation", "Footer navigation")}>
        <Link to="/#product">{t("marketing.product", "Product")}</Link><Link to="/pricing">{t("marketing.pricing", "Pricing")}</Link>
        <Link to="/login">{t("marketing.signIn", "Sign in")}</Link><Link to="/#contact">{t("marketing.getStarted", "Get started")}</Link>
      </nav>
    </div>
    <div className="marketing-footer-bottom"><span>© {new Date().getFullYear()} DigiMenu · siawa Technologies</span>
      <button type="button" className="marketing-text-button" onClick={() => window.scrollTo({ top: 0 })}><ArrowUp size={16} />{t("marketing.backTop", "Back to top")}</button>
    </div>
  </div></footer>
}
