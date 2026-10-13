import { createContext, useContext } from "react"

export const PlanContext = createContext(null)

export function usePlan() {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error("usePlan must be used within a PlanProvider")
  return ctx
}
