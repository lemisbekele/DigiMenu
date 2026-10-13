import { describe, expect, it } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { OptimizedImage } from "./OptimizedImage"

describe("OptimizedImage component", () => {
  it("renders responsive srcSet for Supabase webp images by default", () => {
    const supabaseUrl = "https://example.supabase.co/storage/v1/object/public/cafe-assets/menuImages/coffee.webp"
    render(<OptimizedImage src={supabaseUrl} alt="Coffee" />)

    const img = screen.getByRole("img", { name: "Coffee" })
    expect(img.getAttribute("srcset")).toContain("coffee_thumb.webp")
    expect(img.getAttribute("srcset")).toContain("coffee_sm.webp")
  })

  it("gracefully falls back to primary src when responsive srcSet variants fail to load (404)", () => {
    const supabaseUrl = "https://example.supabase.co/storage/v1/object/public/cafe-assets/menuImages/coffee.webp"
    render(<OptimizedImage src={supabaseUrl} alt="Coffee" />)

    const img = screen.getByRole("img", { name: "Coffee" })
    expect(img.getAttribute("srcset")).toBeTruthy()

    // Simulate 404 error on initial srcSet variant load
    fireEvent.error(img)

    // Verify img retries with primary src without srcSet
    const retriedImg = screen.getByRole("img", { name: "Coffee" })
    expect(retriedImg.getAttribute("srcset")).toBeNull()
    expect(retriedImg.getAttribute("src")).toBe(supabaseUrl)
  })

  it("renders fallback UI when both srcSet and primary src fail", () => {
    const brokenUrl = "https://example.com/nonexistent.jpg"
    render(<OptimizedImage src={brokenUrl} alt="Missing image" />)

    const img = screen.getByRole("img", { name: "Missing image" })

    // Simulate image error
    fireEvent.error(img)

    // Verify fallback icon container is displayed
    const fallback = screen.getByRole("img", { name: "Missing image" })
    expect(fallback).toHaveClass("optimized-image-fallback")
  })
})
