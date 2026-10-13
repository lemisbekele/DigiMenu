import { describe, expect, it } from "vitest"
import { DEFAULT_ERROR_MESSAGE, toUserMessage } from "./userMessages"
import { friendlyErrorMessage } from "./monitoring"

describe("user-facing error messages", () => {
  it.each([
    { code: "42P01", message: 'relation "private_customer_records" does not exist', details: "secret customer data" },
    { code: "PGRST204", message: "Could not find column private_key in schema cache" },
    new Error("Supabase storage internal error: service_role=secret"),
    "<script>private data</script>",
    null, undefined, { message: { secret: "private" } },
  ])("does not expose unknown backend details: %j", error => {
    expect(toUserMessage(error)).toBe(DEFAULT_ERROR_MESSAGE)
    expect(toUserMessage(error, "Could not save your changes. Please try again.")).toBe("Could not save your changes. Please try again.")
  })

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])("does not resolve inherited error codes: %s", code => {
    expect(toUserMessage({ code, message: "internal detail" })).toBe(DEFAULT_ERROR_MESSAGE)
  })

  it.each([
    ["invalid_credentials", "The email or password is incorrect. Please try again."],
    ["23505", "A matching record already exists. Check the details and try again."],
    ["42501", "You don’t have permission to do that. Contact your cafe owner if you need access."],
  ])("uses safe copy for known code %s", (code, expected) => {
    expect(toUserMessage({ code, message: "private constraint and record data" })).toBe(expected)
  })

  it.each([401, 403, 429])("provides actionable status %s guidance", status => {
    const message = toUserMessage({ status, message: "private response" })
    expect(message).not.toBe(DEFAULT_ERROR_MESSAGE)
    expect(message).not.toContain("private response")
  })

  it("retains explicitly approved validation and currency guidance only", () => {
    const message = "Currency is locked after the first order. Existing amounts cannot be converted by changing settings."
    expect(toUserMessage(new Error(message))).toBe(message)
    expect(toUserMessage(new Error(message + " SQL details"))).toBe(DEFAULT_ERROR_MESSAGE)
    expect(toUserMessage(new Error("Email is required."))).toBe("Email is required.")
  })

  it("maps recognized prefixes without returning their potentially sensitive suffix", () => {
    expect(toUserMessage(new Error("Cafe Not Found: Supabase record private data"))).toBe("We couldn’t find this cafe. Check the link or ask the cafe for a new QR code.")
    expect(toUserMessage(new Error("Access Denied: private role details"))).not.toContain("private")
  })

  it("also protects the legacy friendly-message entry point", () => {
    expect(friendlyErrorMessage("Supabase schema cache error")).toBe(DEFAULT_ERROR_MESSAGE)
  })
})
