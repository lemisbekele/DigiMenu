import { contrastRatio, auditTokens } from "./uiAudit.mjs"

test("contrast matches WCAG", () => {
  expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0)
  expect(contrastRatio("#8a4b0c", "#fbf4df")).toBeCloseTo(6.18, 1)
})

test("flags a failing pair in either theme", () => {
  const css = `:root{--text:#777777;--surface:#ffffff}html[data-theme="dark"]{--text:#f3f5f6;--surface:#202527}`
  expect(auditTokens(css)).toEqual(["light: --text on --surface 4.48"])
})
