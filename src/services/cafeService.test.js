import { describe, expect, it, beforeEach, vi } from "vitest"
import {
  slugify,
  ensureUniqueSlug,
  createCafe,
  getCafeBySlug,
} from "./cafeService"

const cafes = []

vi.mock("./supabase", () => ({
  supabase: {
    from: (table) => {
      const filters = []
      const query = {
        select: () => query,
        order: () => query,
        eq: (column, value) => { filters.push([column, value]); return query },
        maybeSingle: async () => ({
          data: table === "cafes" ? cafes.find((row) => filters.every(([column, value]) => String(row[column]) === String(value))) || null : null,
          error: null,
        }),
        insert: async (rows) => { cafes.push(...rows); return { data: rows, error: null } },
        update: () => query,
        delete: () => query,
        then: async (resolve) => resolve({
          data: table === "cafes"
            ? cafes.filter((row) => filters.every(([column, value]) => String(row[column]) === String(value)))
            : [],
          error: null,
        }),
      }
      return query
    },
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }) }),
    removeChannel: async () => {},
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}))

describe("Multi-Tenant Cafe Service & Slug Utilities", () => {
  beforeEach(() => {
    localStorage.clear()
    cafes.length = 0
  })

  it("slugifies cafe names into clean URL-friendly strings", () => {
    expect(slugify("Sunrise Cafe")).toBe("sunrise-cafe")
    expect(slugify("  Green Garden & Bakery! ")).toBe("green-garden-bakery")
    expect(slugify("Arada Coffee 100% Ethiopian")).toBe("arada-coffee-100-ethiopian")
    expect(slugify("")).toBe("cafe")
  })

  it("ensures unique slugs when duplicate cafe names are registered", async () => {
    const slug1 = await ensureUniqueSlug("Sunrise Cafe")
    expect(slug1).toBe("sunrise-cafe")

    await createCafe({ name: "Sunrise Cafe", ownerEmail: "owner1@sunrise.com" })

    const slug2 = await ensureUniqueSlug("Sunrise Cafe")
    expect(slug2).toBe("sunrise-cafe-2")
  }, 15000)

  it("creates a new cafe environment with unique ID and slug", async () => {
    const cafe = await createCafe({
      name: "Abyssinia Roast",
      ownerEmail: "owner@abyssinia.com",
      subscriptionId: "sub_999",
    })

    expect(cafe).toBeDefined()
    expect(cafe.name).toBe("Abyssinia Roast")
    expect(cafe.slug).toBe("abyssinia-roast")
    expect(cafe.owner_email).toBe("owner@abyssinia.com")
    expect(cafe.status).toBe("active")

    const fetched = await getCafeBySlug("abyssinia-roast")
    expect(fetched).toBeDefined()
    expect(fetched.name).toBe("Abyssinia Roast")
  })

  it("does not invent a demo cafe when a slug is missing", async () => {
    const cafe = await getCafeBySlug("demo-cafe")
    expect(cafe).toBeNull()
  })

  it("returns null for non-existent cafe slugs", async () => {
    const cafe = await getCafeBySlug("non-existent-cafe-999")
    expect(cafe).toBeNull()
  })
})
