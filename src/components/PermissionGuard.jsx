import { useRBAC } from "../context/rbacContextValue"

export function PermissionGuard({ permission, permissions, fallback = null, children }) {
  const { can, canAny } = useRBAC()
  const allowed = permissions ? canAny(permissions) : can(permission)
  if (!allowed) return fallback
  return children
}
