import React, { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { OptimizedImage } from "./OptimizedImage"

export function FullScreenImageViewer({ src, alt = "", onClose }) {
  const backdropRef = useRef(null)
  const closeBtnRef = useRef(null)

  const [touchStartY, setTouchStartY] = useState(null)
  const [swipeOffset, setSwipeOffset] = useState(0)

  // 1. Prevent background scrolling on mount & restore on unmount
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeBtnRef.current?.focus()

    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // 2. Close on Escape key press (desktop)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // 3. Close on clicking dark backdrop
  const handleBackdropClick = (e) => {
    if (
      e.target === backdropRef.current ||
      e.target.classList.contains("fullscreen-viewer-stage")
    ) {
      onClose()
    }
  }

  // 4. Swipe down gesture for mobile devices
  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      setTouchStartY(e.touches[0].clientY)
    }
  }

  const handleTouchMove = (e) => {
    if (touchStartY !== null && e.touches && e.touches.length === 1) {
      const deltaY = e.touches[0].clientY - touchStartY
      if (deltaY > 0) {
        setSwipeOffset(deltaY)
      }
    }
  }

  const handleTouchEnd = () => {
    if (swipeOffset > 85) {
      onClose()
    }
    setTouchStartY(null)
    setSwipeOffset(0)
  }

  if (!src) return null

  const imageTransformStyle = swipeOffset > 0
    ? { transform: `translateY(${swipeOffset}px) scale(${Math.max(0.75, 1 - swipeOffset / 450)})`, transition: "none" }
    : {}

  return (
    <div
      className="fullscreen-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Full-screen image view"}
      ref={backdropRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Floating Close (✕) button - top-right fixed position with generous touch target */}
      <button
        ref={closeBtnRef}
        className="fullscreen-close-btn"
        type="button"
        onClick={onClose}
        aria-label="Close full-screen image view"
      >
        <X size={26} />
      </button>

      {/* Main Fullscreen Stage - Centered uncropped image occupying max viewport space */}
      <div className="fullscreen-viewer-stage">
        <div className="fullscreen-image-wrapper" style={imageTransformStyle}>
          <OptimizedImage
            src={src}
            alt={alt}
            priority={true}
            aspectRatio="auto"
            objectFit="contain"
            className="fullscreen-image"
          />
        </div>
      </div>
    </div>
  )
}
