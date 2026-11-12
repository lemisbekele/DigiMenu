import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

// Dev-server only (configureServer never runs in `vite build`). Hands test-account
// credentials to src/devLogin.js, but only to requests from this PC.
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])
// A tunnel or proxy on this PC (ngrok, cloudflared, another dev server's proxy) makes remote requests
// arrive from loopback, so also require a local Host and no forwarding headers.
export function isLocalRequest(req) {
  if (!LOOPBACK.has(req.socket?.remoteAddress)) return false
  if (req.headers["x-forwarded-for"] || req.headers.forwarded || req.headers["x-forwarded-host"]) return false
  const host = String(req.headers.host || "").replace(/:\d+$/, "").toLowerCase()
  return LOCAL_HOSTNAMES.has(host)
}
// admin.test@x.com, me+test@x.com, test1@x.com, or anything at a .test domain (reserved, never real mail)
const isTestEmail = (email) => /(^|[.+_-])test([.+_-]|\d|@)/i.test(email.split("@")[0] + "@") || /\.test$/i.test(email)

function devLoginEndpoint() {
  return {
    name: "dev-login-endpoint",
    configureServer(server) {
      // No VITE_ prefix, so these never get inlined into code served to the browser.
      const env = loadEnv(server.config.mode, process.cwd(), "DEV_")
      server.middlewares.use("/__dev-login", (req, res) => {
        res.setHeader("Cache-Control", "no-store")
        if (!isLocalRequest(req)) { res.statusCode = 403; return res.end() }
        const as = new URL(req.url, "http://x").searchParams.get("as")
        const prefix = as ? `DEV_${as.toUpperCase().replace(/[^A-Z0-9_]/g, "")}_` : "DEV_"
        const email = env[`${prefix}EMAIL`], password = env[`${prefix}PASSWORD`]
        if (!email || !password) { res.statusCode = 404; return res.end() }
        if (!isTestEmail(email)) { res.statusCode = 422; return res.end("not a test account") }
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({ email, password }))
      })
    },
  }
}

export default defineConfig({
  server: { watch: { ignored: ["**/artifacts/**", "**/supabase/**"] } },
  plugins: [
    react(),
    devLoginEndpoint(),
  ],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("browser-image-compression")) return "image-compression"
          if (id.includes("@supabase/")) return "supabase"
          if (id.includes("node_modules")) return "vendor"
          return undefined
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    testTimeout: 10000,
  },
})
