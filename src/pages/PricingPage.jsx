import { useSearchParams } from "react-router-dom"
import { PortfolioNavbar, PortfolioFooter } from "../components/PortfolioNav"
import { PricingSection } from "../components/PricingSection"
import "./portfolio.css"

export function PricingPage() {
  const [params] = useSearchParams()
  return <div className="marketing-page"><PortfolioNavbar /><main id="main" className="marketing-container marketing-section pricing-page-main"><PricingSection headingLevel={1} lockedFeatureKey={params.get("locked")} /></main><PortfolioFooter /></div>
}
