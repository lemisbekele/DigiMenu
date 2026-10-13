import { describe, expect, it, beforeEach, vi } from "vitest"
import {
  createSubscriptionRequest,
  approveSubscriptionRequest,
  rejectSubscriptionRequest,
  fetchSubscriptionRequests,
  generateTemporaryPassword,
  SUBSCRIPTION_STATUS,
} from "./subscriptionService"

const db = vi.hoisted(() => ({
  subscription_requests: [],
  user_roles: [],
  cafes: [],
  audit_logs: [],
  auth_users: [],
}))

vi.mock("../services/supabase", () => {
  function makeQuery(table) {
    const filters = []
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (col, val) => {
        filters.push([col, val])
        return builder
      },
      single: async () => ({ data: apply()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
      insert: (rows) => {
        db[table].push(...(Array.isArray(rows) ? rows : [rows]))
        return builder
      },
      upsert: (rows) => {
        db[table].push(...(Array.isArray(rows) ? rows : [rows]))
        return builder
      },
      update: (patch) => {
        for (const row of apply()) Object.assign(row, patch)
        return builder
      },
      delete: () => builder,
      then: async (resolve) => resolve({ data: apply(), error: null }),
    }
    function apply() {
      let rows = db[table] || []
      for (const [col, val] of filters) {
        rows = rows.filter((r) => String(r[col]) === String(val))
      }
      return rows
    }
    return builder
  }
  return {
    supabase: {
      from: (table) => makeQuery(table),
      channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }), unsubscribe: vi.fn() }),
      removeChannel: async () => {},
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "platform-user" } } }, error: null }),
        signUp: async ({ email }) => {
          if (db.auth_users.some((u) => u.email === email)) {
            return { data: { user: null, session: null }, error: { message: "User already registered" } }
          }
          const user = { id: `auth_${db.auth_users.length + 1}`, email, user_metadata: {} }
          db.auth_users.push(user)
          return { data: { user, session: null }, error: null }
        },
        signOut: async () => ({ error: null }),
        updateUser: async () => ({ error: null }),
      },
      functions: {
        invoke: async (_name, { body }) => {
          const request = db.subscription_requests.find((entry) => entry.id === body.requestId)
          const user = { id: `auth_${db.auth_users.length + 1}`, email: request.email }
          db.auth_users.push(user)
          const cafe = { id: `cafe_${request.id}`, name: request.customer_name, slug: request.customer_name.toLowerCase().replace(/\s+/g, "-"), owner_email: request.email }
          db.cafes.push(cafe)
          Object.assign(request, { status: "active", cafe_id: cafe.id, cafe_slug: cafe.slug, customer_admin_id: user.id })
          return { data: { cafe, userId: user.id, approvedAt: new Date().toISOString() }, error: null }
        },
      },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
      rpc: async () => ({ data: null, error: null }),
    },
  }
})

describe("Subscription Service & Account Approval Workflow", () => {
  beforeEach(() => {
    localStorage.clear()
    db.subscription_requests.length = 0
    db.user_roles.length = 0
    db.user_roles.push({ id: "platform-user", role: "superadmin", disabled: false })
    db.cafes.length = 0
    db.audit_logs.length = 0
    db.auth_users.length = 0
  })

  it("generates a strong temporary password meeting security requirements", () => {
    const pwd = generateTemporaryPassword()
    expect(pwd.length).toBeGreaterThanOrEqual(8)
    expect(/[A-Z]/.test(pwd)).toBe(true)
    expect(/[a-z]/.test(pwd)).toBe(true)
    expect(/[0-9]/.test(pwd)).toBe(true)
    expect(/[!@#$%^&*]/.test(pwd)).toBe(true)
  })

  it("creates a subscription request with status Pending Approval", async () => {
    const req = await createSubscriptionRequest({
      customerName: "Arada Coffee",
      email: "arada.owner@gmail.com",
      phone: "+251 91 111 2222",
      planKey: "professional",
      notes: "2 branches in Addis",
    })

    expect(req.id).toBeDefined()
    expect(req.customer_name).toBe("Arada Coffee")
    expect(req.email).toBe("arada.owner@gmail.com")
    expect(req.plan_key).toBe("professional")
    expect(req.status).toBe(SUBSCRIPTION_STATUS.PENDING_APPROVAL)
    expect(req.requested_at).toBeDefined()

    const all = await fetchSubscriptionRequests()
    expect(all.length).toBe(1)
    expect(all[0].email).toBe("arada.owner@gmail.com")
  }, 15000)

  it("does not accept a client role as platform authority", async () => {
    db.user_roles[0].role = "cashier"
    await expect(approveSubscriptionRequest("missing", null, "superadmin")).rejects.toThrow("Authorization Error")
  })

  it("enforces backend authority check: rejects non-superadmin approval attempts", async () => {
    const req = await createSubscriptionRequest({
      customerName: "Unauthorized Enterprise",
      email: "test@gmail.com",
      planKey: "enterprise",
    })

    await expect(approveSubscriptionRequest(req.id, null, "admin")).rejects.toThrow(
      "Authorization Error: Only Super Admin can approve",
    )

    await expect(rejectSubscriptionRequest(req.id, "reason", "manager")).rejects.toThrow(
      "Authorization Error: Only Super Admin can approve",
    )
  })

  it("approves a subscription request when actor is superadmin and provisions temporary credentials", async () => {
    const req = await createSubscriptionRequest({
      customerName: "Kazanchis Cafe",
      email: "kazanchis@gmail.com",
      planKey: "enterprise",
    })

    const approval = await approveSubscriptionRequest(req.id, null, "superadmin")

    expect(approval.request.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
    expect(approval.request.approved_at).toBeDefined()
    expect(approval.credentials.email).toBe("kazanchis@gmail.com")
    expect(approval.credentials.temporaryPassword).toBeDefined()
    expect(approval.credentials.temporaryPassword.length).toBeGreaterThanOrEqual(8)
  })

  it("prevents duplicate approvals on an already approved subscription", async () => {
    const req = await createSubscriptionRequest({
      customerName: "Piassa Lounge",
      email: "piassa@gmail.com",
      planKey: "professional",
    })

    await approveSubscriptionRequest(req.id, null, "superadmin")

    await expect(approveSubscriptionRequest(req.id, null, "superadmin")).rejects.toThrow(
      "already been approved",
    )
  })

  it("rejects a subscription request when actor is superadmin", async () => {
    const req = await createSubscriptionRequest({
      customerName: "Invalid Business",
      email: "spam@gmail.com",
      planKey: "starter",
    })

    const rejected = await rejectSubscriptionRequest(
      req.id,
      "Incomplete contact details.",
      "superadmin",
    )

    expect(rejected.status).toBe(SUBSCRIPTION_STATUS.REJECTED)
    expect(rejected.rejected_at).toBeDefined()
    expect(rejected.rejection_reason).toBe("Incomplete contact details.")
  })
})
