import { isLocalRequest } from "../vite.config.js"

const req = (remoteAddress, host, extra = {}) => ({ socket: { remoteAddress }, headers: { host, ...extra } })

test("answers this PC only", () => {
  expect(isLocalRequest(req("127.0.0.1", "localhost:3000"))).toBe(true)
  expect(isLocalRequest(req("::1", "[::1]:3000"))).toBe(true)
  expect(isLocalRequest(req("172.29.31.218", "localhost:3000"))).toBe(false)
})

test("refuses requests relayed by a local tunnel or proxy", () => {
  expect(isLocalRequest(req("127.0.0.1", "abc123.ngrok.app"))).toBe(false)
  expect(isLocalRequest(req("127.0.0.1", "localhost:3000", { "x-forwarded-for": "203.0.113.9" }))).toBe(false)
  expect(isLocalRequest(req("127.0.0.1", "localhost:3000", { forwarded: "for=203.0.113.9" }))).toBe(false)
})
