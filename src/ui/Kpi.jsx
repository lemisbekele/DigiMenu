import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }

// Headline figure card (docs/design-language.html "Records" screen).
// trend: { dir: "up" | "down" | "flat", text } — or pass note for a plain line under the figure.
export function Kpi({ icon: Icon, label, value, trend, note }) {
  const TrendIcon = trend ? TREND_ICON[trend.dir] : null
  return (
    <article className="ui-card kpi">
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        {Icon ? <span className="kpi-icon" aria-hidden="true"><Icon size={16} /></span> : null}
      </div>
      <strong className="kpi-value">{value}</strong>
      {trend ? <span className="kpi-trend" data-dir={trend.dir}><TrendIcon size={14} aria-hidden="true" />{trend.text}</span>
        : note ? <span className="kpi-trend" data-dir="flat">{note}</span> : null}
    </article>
  )
}
