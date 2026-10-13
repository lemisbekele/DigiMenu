import { createContext, useContext } from "react"

export const RBACContext = createContext(null)

export function useRBAC() {
  const ctx = useContext(RBACContext)
  if (!ctx) throw new Error("useRBAC must be used within an RBACProvider")
  return ctx
}
