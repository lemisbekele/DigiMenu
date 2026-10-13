import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ClipboardList, CookingPot, CreditCard, ChartNoAxesCombined, QrCode, ShieldCheck } from "lucide-react"
import { useTranslation } from "react-i18next"
import { PortfolioNavbar, PortfolioFooter } from "../components/PortfolioNav"
import { PricingSection } from "../components/PricingSection"
import { Modal } from "../components/Modal"
import "./portfolio.css"

const workflows = [
  { key: "menu", icon: QrCode, title: "Make ordering feel effortless", text: "Guests scan a table QR code, explore your menu, choose extras and send an order from their own phone.", image: "customer_menu_mobile.png", mobile: true },
  { key: "kitchen", icon: CookingPot, title: "Keep the kitchen in the loop", text: "Give your kitchen a focused queue with item details, preparation notes and clear preparing-to-ready actions.", image: "kitchen_kds.png" },
  { key: "payments", icon: CreditCard, title: "Close each order with confidence", text: "Cashiers review bank-transfer proofs, confirm cash payments and track unsettled orders in one workspace.", image: "cashier_pos.png" },
]

export function PortfolioPage() {
  const { t } = useTranslation()
  const [preview, setPreview] = useState(null)
  return <div className="marketing-page"><PortfolioNavbar /><main id="main">
    <section className="marketing-hero marketing-container" id="overview">
      <div className="marketing-hero-copy"><p className="marketing-eyebrow">{t("marketing.eyebrow", "CAFE OPERATIONS, CONNECTED")}</p>
        <h1>{t("marketing.heroTitle", "Less juggling. More time for your guests.")}</h1>
        <p className="marketing-lead">{t("marketing.heroCopy", "Bring your menu, orders, kitchen and payments into one clear workflow. DigiMenu helps every person on your team know what comes next.")}</p>
        <div className="marketing-actions"><Link to="/pricing" className="primary-button">{t("marketing.comparePlans", "Find your plan")} <ArrowRight size={18} /></Link>
          <a href="#product" className="marketing-secondary">{t("marketing.explore", "Explore the product")}</a></div>
        <p className="marketing-small">{t("marketing.heroNote", "Browser-based tools for owners, managers, cashiers and kitchen teams.")}</p>
      </div>
      <div className="marketing-hero-visual"><div className="marketing-window-header"><span className="marketing-window-dot" /><span>{t("marketing.workspace", "Your cafe, at a glance")}</span></div>
        <button type="button" className="marketing-preview" onClick={() => setPreview({ image: "operations_dashboard.png", title: t("marketing.dashboard", "Operations dashboard") })} aria-label={t("marketing.previewDashboard", "Preview the operations dashboard")}>
          <img src="/assets/screenshots/operations_dashboard.png" alt={t("marketing.dashboardAlt", "DigiMenu dashboard showing sales, orders and cafe performance")} width="1440" height="900" fetchPriority="high" /></button>
        <div className="marketing-preview-caption"><ShieldCheck size={18} />{t("marketing.demoNote", "Product preview using demonstration data")}</div>
      </div>
    </section>
    <section className="marketing-value-strip marketing-container" aria-label={t("marketing.benefits", "Product benefits")}>
      <div><ClipboardList /><span>{t("marketing.oneFlow", "One connected order flow")}</span></div><div><ShieldCheck /><span>{t("marketing.roleAccess", "Access tailored to each role")}</span></div><div><ChartNoAxesCombined /><span>{t("marketing.visibility", "A clearer view of your business")}</span></div>
    </section>
    <section className="marketing-section marketing-container" id="product"><div className="marketing-section-heading"><p className="marketing-eyebrow">{t("marketing.product", "Product")}</p>
      <h2>{t("marketing.productTitle", "From the table to the kitchen. And back again.")}</h2><p>{t("marketing.productCopy", "Purpose-built workspaces keep the whole team moving together. Choose a package with the capabilities your cafe needs.")}</p></div>
      <div className="marketing-workflows">{workflows.map(({ key, icon: Icon, title, text, image, mobile }, index) => <article key={key}>
        <div className={`marketing-workflow-image ${mobile ? "is-mobile" : ""}`}><img src={`/assets/screenshots/${image}`} alt={t(`marketing.${key}Alt`, title)} loading="lazy" width={mobile ? 390 : 1440} height="900" /></div>
        <div className="marketing-workflow-copy"><span className="marketing-step"><Icon size={20} /> 0{index + 1}</span><h3>{t(`marketing.${key}Title`, title)}</h3><p>{t(`marketing.${key}Copy`, text)}</p>
          <button type="button" className="marketing-text-button" onClick={() => setPreview({ image, title: t(`marketing.${key}Title`, title) })}>{t("marketing.viewScreen", "View screen")} <ArrowRight size={16} /></button></div>
      </article>)}</div>
    </section>
    <section className="marketing-operations"><div className="marketing-container marketing-split"><div><p className="marketing-eyebrow">{t("marketing.behindCounter", "BEHIND THE COUNTER")}</p><h2>{t("marketing.operationsTitle", "Your team has its workspace. You have the bigger picture.")}</h2></div>
      <div><p>{t("marketing.operationsCopy", "Manage menu availability, keep track of inventory, organize table QR codes and review sales. Role-based access separates everyday service from sensitive cafe settings.")}</p><p>{t("marketing.isolationCopy", "Each cafe has its own staff, records and subscription. Platform administration is kept separate from cafe operations.")}</p><Link className="marketing-text-button" to="/pricing">{t("marketing.compareFeatures", "Compare included features")} <ArrowRight size={16} /></Link></div>
    </div></section>
    <section className="marketing-section marketing-container" id="packages"><PricingSection /></section>
    <section className="marketing-container marketing-onboarding" id="contact"><div><p className="marketing-eyebrow">{t("marketing.getStarted", "Get started")}</p><h2>{t("marketing.startTitle", "Build a calmer cafe workflow.")}</h2>
      <p>{t("marketing.startCopy", "Choose a published package and send your cafe details. The platform team reviews your request before creating your cafe and owner account.")}</p><Link to="/pricing" className="primary-button">{t("marketing.requestAccess", "Choose a plan and request access")} <ArrowRight size={18} /></Link></div>
      <ol><li>{t("marketing.step1", "Choose the features and limits that fit your cafe.")}</li><li>{t("marketing.step2", "Submit your details for review. No automatic charge.")}</li><li>{t("marketing.step3", "Once approved, set up your menu and invite your team where your package allows.")}</li></ol>
    </section>
  </main><PortfolioFooter />
    {preview && <Modal className="product-preview-dialog" title={preview.title} onClose={() => setPreview(null)}><img src={`/assets/screenshots/${preview.image}`} alt={preview.title} /><p>{t("marketing.demoNote", "Product preview using demonstration data")}</p></Modal>}
  </div>
}

export default PortfolioPage
