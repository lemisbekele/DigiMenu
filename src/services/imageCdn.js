// Rewrites menu photo links to the Cloudflare image Worker when VITE_IMAGE_CDN_URL is set.
// Works on a single URL or a whole srcSet string. Unset: links stay on Supabase.
const MENU_PHOTOS = "/storage/v1/object/public/cafe-assets/menuImages/"
const trimSlash = (value) => String(value || "").trim().replace(/\/$/, "")

export function toImageCdn(value, cdn = import.meta.env.VITE_IMAGE_CDN_URL, origin = import.meta.env.VITE_SUPABASE_URL) {
  if (!value || !trimSlash(cdn) || !trimSlash(origin)) return value
  return value.replaceAll(trimSlash(origin) + MENU_PHOTOS, trimSlash(cdn) + MENU_PHOTOS)
}
