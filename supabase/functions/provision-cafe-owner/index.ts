import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8"
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers })
  const authorization = request.headers.get("Authorization")
  if (!authorization) return Response.json({ error: "Authentication required." }, { status: 401, headers })
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    })
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return Response.json({ error: "Authentication required." }, { status: 401, headers })
    const { requestId, temporaryPassword } = await request.json()
    if (typeof requestId !== "string" || typeof temporaryPassword !== "string") return Response.json({ error: "Request and password are required." }, { status: 400, headers })
    // The database checks the live platform role and provisions all records atomically.
    const { data, error } = await client.rpc("provision_cafe_owner", { p_request_id: requestId, p_password: temporaryPassword })
    if (error) {
      const allowed = /already has an account|pending request|active package|Temporary password/.test(error.message)
      return Response.json({ error: allowed ? error.message : "Unable to provision this request." }, { status: error.code === "42501" ? 403 : 400, headers })
    }
    return Response.json(data, { headers })
  } catch {
    return Response.json({ error: "Unable to provision this request." }, { status: 400, headers })
  }
})
