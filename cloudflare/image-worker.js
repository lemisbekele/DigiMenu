// Serves DigiMenu menu photos from Cloudflare's cache, so customers' downloads
// don't count against Supabase bandwidth. Photos never change after upload
// (each upload gets a new file name), so they are cached for a year.
// Only public menu photos pass through; payment proofs stay private in Supabase.
const MENU_PHOTOS = "/storage/v1/object/public/cafe-assets/menuImages/"

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 })
    const url = new URL(request.url)
    if (!url.pathname.startsWith(MENU_PHOTOS) || url.pathname.includes("..")) {
      return new Response("Not found", { status: 404 })
    }

    // Query strings are ignored so nobody can fill the cache with copies of one photo.
    const cacheKey = new Request(url.origin + url.pathname)
    const cached = await caches.default.match(cacheKey)
    if (cached) return cached

    const origin = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + url.pathname)
    if (!origin.ok) return new Response("Not found", { status: origin.status === 404 ? 404 : 502 })

    const response = new Response(origin.body, origin)
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable")
    response.headers.set("Access-Control-Allow-Origin", "*")
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
    return response
  },
}
