import { useMemo } from "react"
import { useAuth } from "./authContextValue"
import { hasPermission, hasAnyPermission } from "../services/roleService"
import { RBACContext } from "./rbacContextValue"

export function RBACProvider({ children }) {
  const { user, role } = useAuth()
  const email = user?.email || ""

  const value = useMemo(
    () => ({
      role,
      email,
      can: (permission) => hasPermission(role, permission),
      canAny: (permissions) => hasAnyPermission(role, permissions),
    }),
    [role, email],
  )

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>
}
