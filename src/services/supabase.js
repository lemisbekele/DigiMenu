import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
const customerClients = new Map()

// An isolated storage client carries a customer capability without changing
// the authenticated staff client or persisting a second auth session.
export function customerStorageClient(token) {
  if (customerClients.has(token)) return customerClients.get(token)
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { storageKey: `cafe-proof-${crypto.randomUUID()}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-order-token": token || "" } },
  })
  if (customerClients.size >= 50) customerClients.delete(customerClients.keys().next().value)
  customerClients.set(token, client)
  return client
}
