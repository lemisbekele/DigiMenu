import { Flame, Leaf } from "lucide-react"

export function CalorieBadge({ calories, size = "md" }) {
  const value = Math.round(Number(calories || 0))
  const Icon = value <= 200 ? Leaf : Flame
  const tone = value <= 200 ? "low" : value <= 400 ? "mid" : "high"
  return (
    <span className={`calorie-badge ${tone} ${size}`} aria-label={`${value} kcal`} title={`${value} kcal`}>
      <Icon size={size === "sm" ? 11 : 13} />
      <span>{value} kcal</span>
    </span>
  )
}
