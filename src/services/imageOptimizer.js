
const SUPPORTED_FORMATS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
  "image/tiff",
]

export function isImageTypeSupported(mimeType) {
  return (
    SUPPORTED_FORMATS.includes(mimeType?.toLowerCase()) ||
    Boolean(mimeType?.startsWith("image/"))
  )
}

export function validateImage(file, options = {}) {
  const { maxSizeMB = 10 } = options
  if (!file) return "No file selected."
  if (file.size === 0) return "File is empty."
  if (file.size > maxSizeMB * 1024 * 1024) {
    return `File exceeds maximum allowed size of ${maxSizeMB}MB.`
  }
  if (!file.type || !file.type.startsWith("image/")) {
    return "File is not a supported image type."
  }
  return null
}

export async function validateImageDimensions(file, maxDimension = 5000) {
  return new Promise((resolve, reject) => {
    if (!file || typeof window === "undefined" || !window.URL) {
      resolve(true)
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (img.width > maxDimension || img.height > maxDimension) {
        reject(new Error(`Image dimensions (${img.width}x${img.height}) exceed maximum allowed of ${maxDimension}px.`))
      } else {
        resolve({ width: img.width, height: img.height })
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to decode image file."))
    }
    img.src = url
  })
}

export function extFromMime(mime) {
  if (mime === "image/webp") return "webp"
  if (mime === "image/png") return "png"
  if (mime === "image/gif") return "gif"
  return "jpg"
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/**
 * Computes a SHA-256 hex hash for a File or Blob to enable client-side deduplication.
 */
export async function computeFileHash(file) {
  if (!file || typeof crypto === "undefined" || !crypto.subtle) {
    return `${file?.name || "file"}_${file?.size || 0}_${Date.now()}`
  }
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Converts any image File or Blob to WebP format using HTML Canvas API.
 * Preserves transparency for PNGs / webp / gifs.
 */
export async function convertToWebP(file, maxDim = 1200, quality = 0.82) {
  if (typeof window === "undefined" || !window.HTMLCanvasElement) {
    return file
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          const webpName = (file.name || "image").replace(/\.[^/.]+$/, "") + ".webp"
          const webpFile = new File([blob], webpName, { type: "image/webp" })
          resolve(webpFile)
        },
        "image/webp",
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to process image for WebP conversion."))
    }

    img.src = objectUrl
  })
}

/**
 * Generates responsive image variants (thumb, sm, md, lg) in WebP format.
 */
export async function generateResponsiveVariants(file, quality = 0.82) {
  const sizes = {
    thumb: 200,
    sm: 400,
    md: 800,
    lg: 1200,
  }

  const variants = {}
  for (const [key, maxDim] of Object.entries(sizes)) {
    try {
      const blob = await convertToWebP(file, maxDim, quality)
      variants[key] = blob
    } catch {
      variants[key] = file
    }
  }

  return variants
}

export async function optimizeImage(file, options = {}) {
  const { default: imageCompression } = await import("browser-image-compression")
  const {
    maxWidth = 900,
    maxHeight = 900,
    maxSizeMB = 0.5,
    quality = 0.82,
    onProgress,
  } = options

  const validationError = validateImage(file)
  if (validationError) throw new Error(validationError)

  await validateImageDimensions(file).catch(() => {})

  let webpFile
  try {
    webpFile = await convertToWebP(file, Math.max(maxWidth, maxHeight), quality)
  } catch {
    webpFile = file
  }

  try {
    const compressed = await imageCompression(webpFile, {
      maxSizeMB,
      maxWidthOrHeight: Math.max(maxWidth, maxHeight),
      useWebWorker: true,
      initialQuality: quality,
      fileType: "image/webp",
      onProgress: (pct) => onProgress?.(pct),
    })
    return compressed
  } catch {
    return webpFile
  }
}

export async function generateThumbnail(file, size = 200) {
  try {
    return await convertToWebP(file, size, 0.75)
  } catch {
    return imageCompression(file, {
      maxSizeMB: 0.03,
      maxWidthOrHeight: size,
      useWebWorker: true,
    })
  }
}
