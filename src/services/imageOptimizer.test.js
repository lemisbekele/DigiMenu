import { describe, expect, it } from "vitest"
import {
  validateImage,
  extFromMime,
  formatBytes,
  computeFileHash,
  isImageTypeSupported,
} from "./imageOptimizer"

describe("Image Optimizer Pipeline", () => {
  it("validates supported image mime types", () => {
    expect(isImageTypeSupported("image/jpeg")).toBe(true)
    expect(isImageTypeSupported("image/png")).toBe(true)
    expect(isImageTypeSupported("image/webp")).toBe(true)
    expect(isImageTypeSupported("application/pdf")).toBe(false)
  })

  it("validates image size and type", () => {
    const validFile = new File(["dummy content"], "test.jpg", { type: "image/jpeg" })
    expect(validateImage(validFile)).toBeNull()

    const emptyFile = new File([], "empty.jpg", { type: "image/jpeg" })
    expect(validateImage(emptyFile)).toBe("File is empty.")

    const nonImageFile = new File(["dummy"], "file.txt", { type: "text/plain" })
    expect(validateImage(nonImageFile)).toBe("File is not a supported image type.")
  })

  it("derives file extension from mime type", () => {
    expect(extFromMime("image/webp")).toBe("webp")
    expect(extFromMime("image/png")).toBe("png")
    expect(extFromMime("image/jpeg")).toBe("jpg")
  })

  it("formats file sizes correctly", () => {
    expect(formatBytes(500)).toBe("500 B")
    expect(formatBytes(2048)).toBe("2.0 KB")
    expect(formatBytes(1572864)).toBe("1.5 MB")
  })

  it("generates deterministic SHA-256 hash for file deduplication", async () => {
    const content = "cafe-image-test-bytes"
    const file1 = new File([content], "img1.jpg", { type: "image/jpeg" })
    const file2 = new File([content], "img2.jpg", { type: "image/jpeg" })

    const hash1 = await computeFileHash(file1)
    const hash2 = await computeFileHash(file2)

    expect(hash1).toBeDefined()
    expect(typeof hash1).toBe("string")
    expect(hash1.length).toBe(64)
    expect(hash1).toBe(hash2)
  })
})
