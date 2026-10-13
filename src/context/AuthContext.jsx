import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AuthContext } from "./authContextValue"
import { loginAdmin, logoutAdmin, observeAuth, writeAuditLog } from "../services/dataService"
import { getRoleRoute, ROLE_LABELS, ROLES } from "../services/roleService"
import { supabase } from "../services/supabase"
import { TENANT_ACCESS, validateTenantAccess } from "../services/tenantAccessService"
import { setNotificationUser } from "../services/notificationService"

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState(null)
  const [roleData, setRoleData] = useState(null)
  const [cafeSlug, setCafeSlug] = useState(null)
  const [roleLoading, setRoleLoading] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const loginPendingRef = useRef(false)
  const currentUidRef = useRef(null)
  const roleRequestRef = useRef(0)

  const loadRole = useCallback(async (uid) => {
    if (loginPendingRef.current || uid !== currentUidRef.current) return
    const request = ++roleRequestRef.current
    if (!uid) {
      setRole(null)
      setRoleData(null)
      setCafeSlug(null)
      setMustChangePassword(false)
      setRoleLoading(false)
      return
    }
    setRoleLoading(true)

    try {
      const { data: dbRoleData, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("id", uid)
        .maybeSingle()
      if (error) throw error
      if (dbRoleData && dbRoleData.id !== uid) throw new Error("Account profile mismatch.")

      if (currentUidRef.current !== uid || request !== roleRequestRef.current) return

      // Deactivated accounts must lose their persisted session immediately,
      // not just be blocked at the next login.
      if (dbRoleData?.disabled) {
        await supabase.auth.signOut().catch(() => {})
        currentUidRef.current = null
        setRole(null)
        setRoleData(null)
        setCafeSlug(null)
        setMustChangePassword(false)
        return
      }

      const assigned = dbRoleData?.role || null

      const isMustChange = Boolean(dbRoleData?.must_change_password)
      const userCafeSlug = dbRoleData?.cafe_slug || null

      setRole(assigned || null)
      setRoleData(dbRoleData)
      setCafeSlug(userCafeSlug)
      setMustChangePassword(isMustChange)
    } catch {
      if (currentUidRef.current !== uid || request !== roleRequestRef.current) return
      // A database profile is mandatory. Do not infer a tenant from editable
      // auth metadata or route to a shared fallback cafe.
      setRole(null)
      setRoleData(null)
      setCafeSlug(null)
    } finally {
      if (currentUidRef.current === uid && request === roleRequestRef.current) {
        setRoleLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    return observeAuth((nextUser) => {
      // Password sign-in validates the identity, profile and requested cafe
      // before publishing any session to consumers. SIGNED_IN fires earlier.
      if (loginPendingRef.current) return
      const uid = nextUser?.id || null
      setNotificationUser(uid)
      if (currentUidRef.current !== uid) {
        setRole(null)
        setRoleData(null)
        setCafeSlug(null)
        setMustChangePassword(false)
      }
      currentUidRef.current = uid
      setUser(nextUser)
      if (uid) {
        loadRole(uid).then(() => {
          if (currentUidRef.current === uid) {
            setLoading(false)
          }
        })
      } else {
        setRole(null)
        setRoleData(null)
        setCafeSlug(null)
        setMustChangePassword(false)
        setRoleLoading(false)
        setLoading(false)
      }
    })
  }, [loadRole])

  const login = useCallback(async (email, password, expectedRole = null, expectedCafeSlug = null) => {
    if (loginPendingRef.current) throw new Error("A sign-in is already in progress. Please wait.")
    loginPendingRef.current = true
    setSigningIn(true)
    ++roleRequestRef.current
    currentUidRef.current = null
    setUser(null)
    setRole(null)
    setRoleData(null)
    setCafeSlug(null)
    setMustChangePassword(false)
    setNotificationUser(null)
    try {
      const result = await loginAdmin(email, password)
      // Verify with Auth, not just a persisted local session. A previous account
      // or another tab must never satisfy a new credentials submission.
      const { data: verifiedData, error: sessionError } = await supabase.auth.getUser()
      const sessionUser = verifiedData?.user
      if (sessionError || !sessionUser || sessionUser.id !== result.user?.id ||
        sessionUser.email?.toLowerCase() !== String(email).trim().toLowerCase()) {
        throw new Error("We could not sign you in. Please try again.")
      }
      const uid = sessionUser.id

      const { data: dbRoleData, error: profileError } = await supabase
        .from("user_roles")
        .select("*")
        .eq("id", uid)
        .maybeSingle()
      if (profileError || (dbRoleData && dbRoleData.id !== uid)) {
        throw new Error("Account validation is temporarily unavailable. Please try again.")
      }

      const assignedRole = dbRoleData?.role || null

      if (dbRoleData?.disabled) {
        throw new Error("Account Disabled: Your account has been deactivated. Please contact an administrator.")
      }

      if (!Object.values(ROLES).includes(assignedRole)) {
        throw new Error("Access Denied: Your account has not been provisioned with a role. Please contact an administrator.")
      }

      if (expectedRole && assignedRole !== expectedRole) {
        const portalLabel = ROLE_LABELS[expectedRole] || expectedRole
        throw new Error(`Access Denied: Your account is not authorized for the ${portalLabel} portal.`)
      }

      const userCafeSlug = dbRoleData?.cafe_slug || null

      // Platform-owner credentials are only valid in the platform console. A
      // cafe portal must never accept them (they would silently bypass the
      // tenant assignment checks below).
      if (expectedCafeSlug && assignedRole === "superadmin") {
        throw new Error("Use the platform sign-in page for your superadmin account.")
      }

      // Enforce cafe tenant isolation for non-superadmin accounts
      if (expectedCafeSlug && assignedRole !== "superadmin" && !userCafeSlug) {
        throw new Error("Access Denied: Your account is not assigned to a cafe.")
      }
      if (expectedCafeSlug && assignedRole !== "superadmin" && userCafeSlug.toLowerCase() !== expectedCafeSlug.toLowerCase()) {
        throw new Error("This account belongs to a different cafe. Use your cafe’s sign-in link.")
      }

      if (assignedRole !== "superadmin") {
        const tenant = await validateTenantAccess({
          slug: userCafeSlug,
          userId: uid,
          requireStaff: true,
        })
        if (tenant.status === TENANT_ACCESS.NOT_FOUND) {
          throw new Error("Cafe Not Found: Check the cafe link and try again.")
        }
        if (tenant.status === TENANT_ACCESS.INACTIVE) {
          throw new Error("Subscription Inactive: This cafe is currently suspended.")
        }
        if (tenant.status === TENANT_ACCESS.SUBSCRIPTION_INACTIVE) {
          throw new Error("Subscription Inactive: This cafe has not been approved or is no longer active.")
        }
        if (tenant.status === TENANT_ACCESS.UNAUTHORIZED) {
          throw new Error("Access Denied: Your account is not assigned to this cafe.")
        }
        if (tenant.status === TENANT_ACCESS.UNAVAILABLE) {
          throw new Error("Cafe validation is temporarily unavailable. Please try again.")
        }
      }

      const finalSlug = assignedRole === "superadmin" ? null : userCafeSlug
      const mustChange = Boolean(dbRoleData?.must_change_password)

      // Another tab may have changed the shared browser session while profile
      // and tenant checks were in flight. Never commit that stale account.
      const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession()
      if (currentSessionError || currentSession?.session?.user?.id !== uid) {
        throw new Error("Your sign-in session changed. Please sign in again.")
      }
      currentUidRef.current = uid
      setUser(sessionUser)
      setNotificationUser(uid)

      setRole(assignedRole)
      setRoleData(dbRoleData)
      setCafeSlug(finalSlug)
      setMustChangePassword(mustChange)

      return { ...result, role: assignedRole, cafeSlug: finalSlug, roleData: dbRoleData }
    } catch (error) {
      // A rejected sign-in must not leave either the attempted account or a
      // previously signed-in account active in this browser. Do not revoke
      // the account's independent sessions on other devices.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {})
      currentUidRef.current = null
      ++roleRequestRef.current
      setUser(null)
      setRole(null)
      setRoleData(null)
      setCafeSlug(null)
      setMustChangePassword(false)
      throw error
    } finally {
      loginPendingRef.current = false
      setSigningIn(false)
      setLoading(false)
      setRoleLoading(false)
    }
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword = null) => {
    // Support both changePassword(newPassword) (forced temp-password flow) and
    // changePassword(currentPassword, newPassword) (settings/profile forms).
    const nextPassword = newPassword ?? currentPassword
    if (!nextPassword || nextPassword.length < 6) {
      throw new Error("New password must be at least 6 characters long.")
    }

    // Settings forms collect the current password — verify it before changing
    // anything so an unattended session cannot rotate the credential.
    if (newPassword != null && currentPassword && user?.email) {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (verifyError) {
        throw new Error(verifyError.message?.includes("Invalid login credentials")
          ? "Current password is incorrect."
          : `Could not verify your current password: ${verifyError.message}`)
      }
    }

    const { error } = await supabase.auth.updateUser({ password: nextPassword })
    if (error) throw new Error(error.message || "Failed to update password.")

    if (user?.id) {
      const { error: profileError } = await supabase
        .from("user_roles")
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq("id", user.id)
      if (profileError) throw new Error("Password changed, but account setup is incomplete. Please sign in again or contact your cafe owner.")
    }

    setMustChangePassword(false)
    await writeAuditLog("user.password.change", { email: user?.email || "" }).catch(() => {})
  }, [user])

  const logout = useCallback(async () => {
    await logoutAdmin()
    currentUidRef.current = null
    ++roleRequestRef.current
    setUser(null)
    setRole(null)
    setRoleData(null)
    setCafeSlug(null)
    setMustChangePassword(false)
    setRoleLoading(false)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase.channel(`profile-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `id=eq.${user.id}` }, () => loadRole(user.id))
      .subscribe()
    const refresh = () => { if (!document.hidden) loadRole(user.id) }
    window.addEventListener("focus", refresh)
    return () => { window.removeEventListener("focus", refresh); supabase.removeChannel(channel).catch(() => {}) }
  }, [user?.id, loadRole])

  const redirectAfterLogin = useCallback(() => {
    if (role === "superadmin") return getRoleRoute(role)
    if (role && cafeSlug) return getRoleRoute(role, cafeSlug)
    return null
  }, [role, cafeSlug])

  const value = useMemo(
    () => ({
      user,
      loading: loading || signingIn,
      signingIn,
      role,
      roleData,
      cafeSlug,
      roleLoading,
      mustChangePassword,
      login,
      logout,
      changePassword,
      redirectAfterLogin,
      refreshRole: loadRole,
    }),
    [user, loading, signingIn, role, roleData, cafeSlug, roleLoading, mustChangePassword, login, logout, changePassword, redirectAfterLogin, loadRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
