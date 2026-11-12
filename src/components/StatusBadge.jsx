import { StatusPill, toneForStatus } from "../ui"

// Kept for existing callers; renders the shared status pill. `type` no longer changes the look.
export function StatusBadge({ label, value }) {
  return <StatusPill tone={toneForStatus(value)}>{label || value}</StatusPill>
}
