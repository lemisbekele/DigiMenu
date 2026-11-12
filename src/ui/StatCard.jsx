export function StatCard({ label, value, trend, trendDown = false }) {
  return (
    <div className="ui-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {trend ? <small data-down={trendDown || undefined}>{trend}</small> : null}
    </div>
  )
}
