export function StatusBadge({ label, type, value }) {
  return <span className={`badge ${type || ""} ${value || ""} ${value === "unpaid" ? "pending" : ""}`}>{label || value}</span>
}

