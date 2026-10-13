import { describe, expect, it } from "vitest"
import {
  ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  getRoleRoute,
  getRouteRole,
  hasPermission,
  getRolePermissions,
} from "./roleService"

describe("Cashier RBAC Role", () => {
  it("defines CASHIER role and route", () => {
    expect(ROLES.CASHIER).toBe("cashier")
    expect(ROLE_LABELS[ROLES.CASHIER]).toBe("Cashier")
    expect(getRoleRoute("cashier")).toBeNull()
    expect(getRoleRoute("cashier", "sunrise-cafe")).toBe("/sunrise-cafe/pos")
    expect(getRoleRoute("superadmin")).toBe("/superadmin/dashboard")
  })

  it("grants payment and order permissions to Cashier", () => {
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.ORDERS_READ)).toBe(true)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.ORDERS_CREATE)).toBe(true)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.ORDERS_UPDATE)).toBe(true)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.PAYMENT_PROCESS)).toBe(true)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.PAYMENT_READ)).toBe(true)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.DISCOUNT_APPLY)).toBe(true)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.TABLE_ASSIGN)).toBe(true)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.TABLE_MANAGE)).toBe(false)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.MENU_READ)).toBe(true)
  })

  it("restricts administrative and menu editing permissions from Cashier", () => {
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.USER_MANAGE)).toBe(false)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.ROLE_MANAGE)).toBe(false)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.MENU_CREATE)).toBe(false)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.MENU_UPDATE)).toBe(false)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.MENU_DELETE)).toBe(false)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.REPORT_FINANCIAL)).toBe(false)
    expect(hasPermission(ROLES.CASHIER, PERMISSIONS.SETTINGS_MANAGE)).toBe(false)
  })

  it("returns correct list of permissions for Cashier role", () => {
    const permissions = getRolePermissions(ROLES.CASHIER)
    expect(permissions).toContain(PERMISSIONS.PAYMENT_PROCESS)
    expect(permissions).not.toContain(PERMISSIONS.USER_MANAGE)
  })

  it("resolves route role for role-specific login paths", () => {
    expect(getRouteRole("/admin/login")).toBe("admin")
    expect(getRouteRole("/cashier/login")).toBe("cashier")
    expect(getRouteRole("/manager/login")).toBe("manager")
    expect(getRouteRole("/barista/login")).toBe("barista")
    expect(getRouteRole("/unknown")).toBeNull()
  })
})
