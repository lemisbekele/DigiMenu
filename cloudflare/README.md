# Menu photos through Cloudflare

Customers load menu photos from Cloudflare's cache instead of Supabase, so
photo downloads stop counting against Supabase bandwidth. Uploads, deletes and
payment proofs are unchanged: they still go to Supabase.

## What you need

- A free Cloudflare account.
- A domain whose DNS is managed by Cloudflare (free plan is fine).
  Caching does not work on `*.workers.dev` addresses, so a domain is required.

## Setup (about 15 minutes)

1. **Put your domain on Cloudflare** (skip if it already is):
   Cloudflare dashboard → Add a domain → follow the steps to change the
   domain's nameservers at your registrar. Wait until it shows "Active".

2. **Edit `cloudflare/wrangler.toml`:**
   - `SUPABASE_URL` → your Supabase project address (same as `VITE_SUPABASE_URL`).
   - `pattern` → the photo address you want, e.g. `img.yourdomain.com`.

3. **Deploy the Worker** from the `cloudflare` folder:

   ```bash
   cd cloudflare
   npx wrangler login
   npx wrangler deploy
   ```

   `custom_domain = true` makes Cloudflare create the DNS record and HTTPS
   certificate for `img.yourdomain.com` automatically.

4. **Check it works.** Open a menu photo through the Worker, e.g.
   `https://img.yourdomain.com/storage/v1/object/public/cafe-assets/menuImages/<cafe>/<file>.webp`.
   Open it twice; the second response should have the header `cf-cache-status: HIT`.

5. **Point the app at it.** Set `VITE_IMAGE_CDN_URL=https://img.yourdomain.com`
   in the app's build settings (AletCloud, `.env`, or Docker build args) and
   redeploy. Leave it empty to go back to loading photos from Supabase.

## Good to know

- Free Workers plan: 100,000 requests a day. Each photo a customer sees once is
  one request; repeat views come from the phone's own cache.
- A deleted photo can stay in Cloudflare's cache for up to a year, but nothing
  links to it any more.
- Payment proofs never pass through this Worker; it only serves `menuImages/`.
