import React, { useState, useEffect } from "react"
import { ImageOff, Utensils } from "lucide-react"
import { toImageCdn } from "../services/imageCdn"

// In-memory cache of already loaded image URLs to prevent skeleton flashes on re-renders
const loadedUrlsCache = new Set()

/**
 * Builds responsive srcSet string for Supabase image assets if variants exist
 */
function buildSrcSet(src) {
  if (!src || typeof src !== "string" || !src.includes("supabase.co/storage")) {
    return undefined
  }
  if (!src.endsWith(".webp")) {
    return undefined
  }

  const basePath = src.replace(/\.webp$/, "")
  return `${basePath}_thumb.webp 200w, ${basePath}_sm.webp 400w, ${basePath}.webp 800w`
}

export function OptimizedImage({
  src,
  alt = "",
  aspectRatio = "4/3",
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  srcSet,
  className = "",
  style = {},
  fallbackType = "food", // 'food' | 'receipt' | 'generic'
  objectFit = "cover",
  onClick,
  ...rest
}) {
  const rawSrc = src && typeof src === "string" && src.trim() !== "" ? src.trim() : null
  // srcSet is worked out from the Supabase address, then both move to the image CDN when one is set.
  const cleanSrc = toImageCdn(rawSrc)
  const isAlreadyLoaded = cleanSrc ? loadedUrlsCache.has(cleanSrc) : false

  const [isLoaded, setIsLoaded] = useState(isAlreadyLoaded)
  const [hasError, setHasError] = useState(!cleanSrc)
  const [srcSetFailed, setSrcSetFailed] = useState(false)

  useEffect(() => {
    if (!cleanSrc) {
      setHasError(true)
      setIsLoaded(false)
      setSrcSetFailed(false)
      return
    }

    if (loadedUrlsCache.has(cleanSrc)) {
      setIsLoaded(true)
      setHasError(false)
      setSrcSetFailed(false)
      return
    }

    setIsLoaded(false)
    setHasError(false)
    setSrcSetFailed(false)

    // Optional priority preloading in document head
    if (priority && typeof document !== "undefined") {
      const linkId = `preload-${encodeURIComponent(cleanSrc)}`
      if (!document.getElementById(linkId)) {
        const link = document.createElement("link")
        link.id = linkId
        link.rel = "preload"
        link.as = "image"
        link.href = cleanSrc
        document.head.appendChild(link)
      }
    }
  }, [cleanSrc, priority])

  const handleLoad = () => {
    if (cleanSrc) {
      loadedUrlsCache.add(cleanSrc)
    }
    setIsLoaded(true)
    setHasError(false)
  }

  const computedSrcSet = !srcSetFailed ? toImageCdn(srcSet || (rawSrc ? buildSrcSet(rawSrc) : undefined)) : undefined

  const handleError = () => {
    if (computedSrcSet && !srcSetFailed) {
      setSrcSetFailed(true)
    } else {
      setHasError(true)
      setIsLoaded(false)
    }
  }

  const containerStyle = {
    aspectRatio: aspectRatio !== "auto" ? aspectRatio : undefined,
    ...style,
  }

  return (
    <div
      className={`optimized-image-container ${className}`.trim()}
      style={containerStyle}
      onClick={onClick}
    >
      {!isLoaded && !hasError ? (
        <div className="skeleton-pulse image-skeleton" aria-hidden="true" />
      ) : null}

      {hasError ? (
        <div className="optimized-image-fallback" role="img" aria-label={alt || "Image unavailable"}>
          {fallbackType === "receipt" ? (
            <ImageOff size={24} className="fallback-icon" />
          ) : (
            <Utensils size={24} className="fallback-icon" />
          )}
        </div>
      ) : (
        <img
          src={cleanSrc}
          alt={alt}
          srcSet={computedSrcSet}
          sizes={computedSrcSet ? sizes : undefined}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`optimized-image ${isLoaded ? "loaded" : "loading"}`}
          style={{ objectFit }}
          {...rest}
        />
      )}
    </div>
  )
}
