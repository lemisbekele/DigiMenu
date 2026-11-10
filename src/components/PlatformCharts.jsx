import { BarChart3, Coffee } from "lucide-react"

// Values remain visible as text, so the charts never rely on color or hover.
export function DistributionChart({ title, description, items, donut = false }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const max = Math.max(1, ...items.map(item => item.value))
  const colors = ["var(--brand)", "var(--info)", "var(--warning)", "var(--muted)"]
  let offset = 0
  const stops = items.map((item, index) => {
    const start = offset
    offset += total ? item.value / total * 100 : 0
    return `${item.color || colors[index % colors.length]} ${start}% ${offset}%`
  })
  return (
    <section className="sa-panel sa-chart">
      <div className="sa-chart-heading"><span className="sa-visual-icon">{donut ? <Coffee size={20} /> : <BarChart3 size={20} />}</span><div><h2>{title}</h2><p>{description}</p></div></div>
      <div className={donut ? "sa-distribution" : ""}>
        {donut && <div className="sa-donut" aria-hidden="true" style={{ background: total ? `conic-gradient(${stops.join(",")})` : "var(--border)" }}><span><strong>{total.toLocaleString()}</strong><small>Total cafes</small></span></div>}
        <ul className="sa-chart-bars">
          {items.map((item, index) => <li key={item.key || item.label}><div className="sa-chart-label"><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></div><div className="sa-chart-track" aria-hidden="true"><span style={{ width: `${item.value / max * 100}%`, background: item.color || colors[index % colors.length] }} /></div></li>)}
        </ul>
      </div>
      {!total && <p className="sa-chart-empty">No records to display yet.</p>}
    </section>
  )
}

export function RequestTrend({ items }) {
  const max = Math.max(1, ...items.map(item => item.value))
  return <section className="sa-panel sa-chart"><div className="sa-chart-heading"><span className="sa-visual-icon"><BarChart3 size={20} /></span><div><h2>Request activity</h2><p>Requests received · last six calendar months</p></div></div><ol className="sa-month-chart">{items.map(item => <li key={item.key}><strong>{item.value.toLocaleString()}</strong><div className="sa-month-track" aria-hidden="true"><span style={{ height: `${item.value / max * 100}%` }} /></div><span>{item.label}</span></li>)}</ol></section>
}

export function VisualSummary({ icon: Icon, title, children }) {
  return <div className="sa-visual-summary"><span className="sa-visual-icon"><Icon size={26} /></span><div><strong>{title}</strong><p>{children}</p></div></div>
}

export function FeedState({ loading, error }) {
  return <div className="sa-panel sa-feed-state" role={error ? "alert" : "status"}>{error ? <><strong>This information could not load.</strong><p>Please refresh the page to try again.</p><button type="button" className="ghost-button" onClick={() => window.location.reload()}>Refresh page</button></> : loading ? "Loading platform information…" : null}</div>
}
