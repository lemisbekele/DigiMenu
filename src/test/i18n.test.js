import { describe, expect, it } from "vitest"
import i18n from "../i18n"

describe("i18next resources", () => {
  it("contains required customer order messages in all supported languages", () => {
    for (const language of ["en", "am", "om"]) {
      expect(i18n.t("receiptTableMessage", { lng: language })).toBeTruthy()
      expect(i18n.t("payAndPlaceOrder", { lng: language })).toBeTruthy()
      expect(i18n.t("pushNotSupported", { lng: language })).toBeTruthy()
    }
  })

  it("falls back to English for missing translation keys", () => {
    expect(i18n.t("checkout", { lng: "missing-language" })).toBe("Confirm Order")
  })
})

