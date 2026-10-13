export function tableUrl(tableNumber, cafeSlug) {
  const slug = String(cafeSlug || "").toLowerCase()
  if (!slug) throw new Error("A cafe slug is required to create a table URL.")
  return `${window.location.origin}/${slug}/menu?table=${tableNumber}`
}
