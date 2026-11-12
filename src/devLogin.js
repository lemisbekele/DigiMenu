// Dev-only auto sign-in. Imported behind import.meta.env.DEV, so production builds never include it.
// Credentials come from the dev server's /__dev-login endpoint (vite.config.js), which only
// answers this PC and only hands out test accounts. Put them in .env.local (git-ignored):
//   DEV_EMAIL=admin.test@...  DEV_PASSWORD=...           default account
//   DEV_CASHIER_EMAIL=...     DEV_CASHIER_PASSWORD=...   used with ?devAs=cashier (any role name)
import { supabase } from "./services/supabase"

export async function devLogin() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) return
  const as = new URLSearchParams(location.search).get("devAs")
  const res = await fetch(`/__dev-login${as ? `?as=${encodeURIComponent(as)}` : ""}`)
  if (!res.ok) {
    if (res.status !== 404) console.warn("[devLogin]", res.status, await res.text())
    return
  }
  const { email, password } = await res.json()

  const { data } = await supabase.auth.getSession()
  const current = data.session?.user?.email?.toLowerCase()
  if (current === email.toLowerCase()) return
  if (current && !as) return // keep a session you picked by hand
  // local: only this browser; a global sign-out would revoke the account's sessions in other tabs too.
  if (current) await supabase.auth.signOut({ scope: "local" })
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) console.warn("[devLogin]", error.message)
  else console.info(`[devLogin] signed in as ${email}`)
}
