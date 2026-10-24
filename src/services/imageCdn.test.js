import { describe, expect, it } from "vitest"
import { toImageCdn } from "./imageCdn"

const origin = "https://abc.supabase.co"
const photo = `${origin}/storage/v1/object/public/cafe-assets/menuImages/lemi/1.webp`

describe("toImageCdn", () => {
  it("moves menu photos to the CDN, including every srcSet entry", () => {
    expect(toImageCdn(photo, "https://img.cafe.com/", origin)).toBe("https://img.cafe.com/storage/v1/object/public/cafe-assets/menuImages/lemi/1.webp")
    const set = `${photo.replace(".webp", "_sm.webp")} 400w, ${photo} 800w`
    expect(toImageCdn(set, "https://img.cafe.com", origin)).not.toContain(origin)
  })

  it("leaves links alone when no CDN is set, and never touches payment proofs or outside links", () => {
    expect(toImageCdn(photo, "", origin)).toBe(photo)
    const proof = `${origin}/storage/v1/object/sign/payment-proofs/lemi/x.webp`
    expect(toImageCdn(proof, "https://img.cafe.com", origin)).toBe(proof)
    expect(toImageCdn("https://images.unsplash.com/a.jpg", "https://img.cafe.com", origin)).toBe("https://images.unsplash.com/a.jpg")
  })
})
