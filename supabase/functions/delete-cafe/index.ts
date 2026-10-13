import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8"
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
async function collect(client: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw error
    for (const entry of data || []) {
      const path = `${prefix}${entry.name}`
      if (entry.id) paths.push(path)
      else paths.push(...await collect(client, bucket, `${path}/`))
    }
    if (!data || data.length < 100) break
  }
  return paths
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers })
  const authorization = request.headers.get("Authorization")
  if (!authorization) return Response.json({ error: "Authentication required." }, { status: 401, headers })
  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: { user }, error: authError } = await caller.auth.getUser()
    if (authError || !user) return Response.json({ error: "Authentication required." }, { status: 401, headers })
    const { data: role, error: roleError } = await caller.rpc("get_user_role")
    if (roleError || role !== "superadmin") return Response.json({ error: "Not authorized." }, { status: 403, headers })
    const { cafeId } = await request.json()
    if (typeof cafeId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(cafeId)) return Response.json({ error: "Invalid cafe." }, { status: 400, headers })
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
    const { data: cafe, error } = await admin.from("cafes").select("id,slug").eq("id", cafeId).single()
    if (error || !cafe || !/^[a-z0-9-]+$/.test(cafe.slug)) return Response.json({ error: "Cafe not found." }, { status: 404, headers })
    // Only trusted cafe prefixes; user-supplied menu/order URLs cannot select other objects.
    const groups = [
      { bucket: "cafe-assets", paths: [...await collect(admin, "cafe-assets", `menuImages/${cafe.slug}/`), ...await collect(admin, "cafe-assets", `paymentProofs/${cafe.slug}/`)] },
      { bucket: "payment-proofs", paths: await collect(admin, "payment-proofs", `${cafe.slug}/`) },
    ]
    const { data: summary, error: deleteError } = await caller.rpc("delete_cafe_tenant", { p_cafe_id: cafeId })
    if (deleteError) throw deleteError
    let filesRemoved = 0
    let cleanupPending = false
    for (const { bucket, paths } of groups) {
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100)
        const { error: storageError } = await admin.storage.from(bucket).remove(chunk)
        if (storageError) cleanupPending = true
        else filesRemoved += chunk.length
      }
    }
    return Response.json({ success: true, cafeId, cafeSlug: cafe.slug, filesRemoved, cleanupPending, summary }, { headers })
  } catch {
    return Response.json({ success: false, error: "Cafe deletion could not complete. Please retry." }, { status: 400, headers })
  }
})
