import { describe, expect, it } from "vitest"
import { CURRENCIES, formatMoney, dateKey, zonedMidnight } from "./regionalSettings"
import { reportRange } from "./reporting"

describe("regional accounting", () => {
  it("shows every amount in ETB, in the reader's number format", () => {
    expect(formatMoney(1234.5, undefined, "en-US")).toMatch(/ETB\s1,234\.50/)
    expect(formatMoney(1234.5, "USD", "en-US")).toMatch(/ETB\s1,234\.50/)
    expect(formatMoney(1234.5, "EUR", "de-DE")).toMatch(/1\.234,50\sETB/)
  })
  it("offers ETB as the only currency", () => {
    expect(CURRENCIES).toEqual(["ETB"])
  })
  it("uses the cafe date across UTC midnight", () => {
    expect(dateKey("2026-09-20T22:00:00Z", "Africa/Addis_Ababa")).toBe("2026-09-21")
    expect(zonedMidnight("2026-09-21", "Africa/Addis_Ababa").toISOString()).toBe("2026-09-20T21:00:00.000Z")
  })
  it("includes exactly the selected local calendar day across DST", () => {
    const spring = reportRange("custom", "2026-03-08", "2026-03-08", new Date(), "America/New_York")
    expect(spring.from.toISOString()).toBe("2026-03-08T05:00:00.000Z")
    expect(spring.to.toISOString()).toBe("2026-03-09T04:00:00.000Z")
    const autumn = reportRange("custom", "2026-11-01", "2026-11-01", new Date(), "America/New_York")
    expect(autumn.to - autumn.from).toBe(25 * 3600000)
  })
})
