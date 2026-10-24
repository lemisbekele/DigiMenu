import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8"
import webpush from "npm:web-push@3.6.7"

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" }
function allowedEndpoint(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
       url.hostname === "web.push.apple.com" || url.hostname.endsWith(".notify.windows.com"))
  } catch { return false }
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers })
  const authorization = request.headers.get("Authorization")
  if (!authorization) return Response.json({ error: "Authentication required." }, { status: 401, headers })
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return Response.json({ error: "Authentication required." }, { status: 401, headers })
    const { orderId } = await request.json()
    if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) return Response.json({ error: "Invalid order." }, { status: 400, headers })
    const { data: event, error } = await client.rpc("get_customer_push_event", { p_order_id: orderId })
    if (error || !event) return Response.json({ error: "Not authorized." }, { status: 403, headers })
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")
    const subject = Deno.env.get("VAPID_SUBJECT")
    if (!publicKey || !privateKey || !subject) return Response.json({ error: "Push notifications are not configured." }, { status: 503, headers })
    const { data: subscriptions, error: subscriptionsError } = await client.rpc("get_order_push_subscriptions", { p_order_id: orderId })
    if (subscriptionsError) throw subscriptionsError
    webpush.setVapidDetails(subject, publicKey, privateKey)
    let sent = 0
    for (const row of (subscriptions || []).slice(0, 20)) {
      const subscription = row.subscription
      if (!subscription || !allowedEndpoint(subscription.endpoint)) continue
      try {
        await webpush.sendNotification(subscription, JSON.stringify(event), { TTL: 300, timeout: 5000 })
        sent++
      } catch (error) {
        // 404/410 mean the browser dropped this subscription; remove it so the table does not only grow.
        // The caller was already authorized for this order above, so the service role is used only for this delete.
        const status = (error as { statusCode?: number })?.statusCode
        if ((status === 404 || status === 410) && row.id) {
          await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
            .from("push_subscriptions").delete().eq("id", row.id)
        }
        /* An expired browser subscription must not abort other recipients. */
      }
    }
    return Response.json({ sent }, { headers })
  } catch {
    return Response.json({ error: "Notification could not be sent." }, { status: 400, headers })
  }
})
