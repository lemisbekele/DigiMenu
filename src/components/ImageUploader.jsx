import { useEffect, useRef, useState } from "react"
import { Globe, UploadCloud, X, AlertCircle } from "lucide-react"
import { validateImage, formatBytes } from "../services/imageOptimizer"
import { OptimizedImage } from "./OptimizedImage"

export function ImageUploader({
  value,
  onChange,
  onUrlChange,
  onRemove,
  accept = "image/*",
  label = "Image",
  urlTabLabel,
  dropText,
  savedText,
  urlPlaceholder,
  fallbackType,
}) {
  const isReceipt = /proof|receipt|payment/i.test(label || "")

  const activeUrlTabLabel = urlTabLabel || (isReceipt ? "Receipt URL" : "Image URL")
  const activeDropText = dropText || (isReceipt ? "Drop file/receipt image here or click to browse" : "Drop image file here or click to browse")
  const activeSavedText = savedText || (isReceipt ? "Receipt proof saved" : "Image saved")
  const activeUrlPlaceholder = urlPlaceholder || (isReceipt ? "Paste receipt URL or transaction link..." : "Paste image URL...")
  const activeFallbackType = fallbackType || (isReceipt ? "receipt" : "food")

  const [mode, setMode] = useState("file")
  const [pendingFile, setPendingFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const inputRef = useRef(null)

  useEffect(() => {
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [pendingFile])

  const process = (f) => {
    setError("")
    const err = validateImage(f)
    if (err) { setError(err); return }
    if (f.size > 5 * 1048576) {
      setError(`File too large (${formatBytes(f.size)}). Max 5 MB.`)
      return
    }
    setPendingFile(f)
    onChange(f)
  }

  const pick = (e) => {
    const f = e.target.files?.[0]
    if (f) process(f)
    e.target.value = ""
  }

  const drop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) process(f)
  }

  const applyUrl = () => {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    setError("")
    try {
      const parsed = new URL(trimmed)
      if (!["http:", "https:"].includes(parsed.protocol)) { setError("Only http and https URLs are allowed."); return }
    } catch { setError("Invalid URL."); return }
    onUrlChange?.(trimmed)
    setUrlInput("")
  }

  const remove = () => {
    setPendingFile(null)
    setPreview(null)
    setError("")
    if (inputRef.current) inputRef.current.value = ""
    onRemove?.()
  }

  const hasCurrent = !!value
  const hasPending = !!pendingFile

  return (
    <div className={`image-uploader${dragOver ? " drag-over" : ""}`}>
      <label className="field" style={{ marginBottom: 6 }}>
        <span>{label}</span>
      </label>

      {!hasCurrent && !hasPending && onUrlChange ? (
        <div className="upload-mode-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "file"} className={`tab${mode === "file" ? " active" : ""}`} onClick={() => setMode("file")}>
            <UploadCloud size={16} /> Upload file
          </button>
          <button type="button" role="tab" aria-selected={mode === "url"} className={`tab${mode === "url" ? " active" : ""}`} onClick={() => setMode("url")}>
            <Globe size={16} /> {activeUrlTabLabel}
          </button>
        </div>
      ) : null}

      {hasCurrent && !hasPending ? (
        <div className="upload-preview-row">
          {typeof value === "string" && (value.match(/\.(jpg|jpeg|png|webp|gif)($|\?)/i) || value.includes("supabase") || value.startsWith("blob:")) ? (
            <OptimizedImage src={value} alt={label} fallbackType={activeFallbackType} aspectRatio="1/1" style={{ width: 48, height: 48, borderRadius: 6 }} />
          ) : (
            <Globe size={22} style={{ color: "var(--brand)", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.85rem", color: "var(--brand-ink)", fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value}
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--brand)", fontWeight: 700 }}>{activeSavedText}</span>
          </div>
          <button className="icon-button small danger" type="button" onClick={remove} aria-label={`Remove ${label}`}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {hasPending ? (
        <div className="upload-preview-row">
          {preview ? <OptimizedImage src={preview} alt="Preview" fallbackType={activeFallbackType} aspectRatio="1/1" style={{ width: 48, height: 48, borderRadius: 6 }} /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.85rem", opacity: 0.7, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pendingFile.name} ({formatBytes(pendingFile.size)})
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--accent)" }}>Ready to save</span>
          </div>
          <button className="icon-button small" type="button" onClick={remove} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="form-error" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.85rem" }}>
          <AlertCircle size={14} /> {error}
        </p>
      ) : null}

      {!hasCurrent && !hasPending && mode === "file" ? (
        <div className="upload-drop-zone" role="button" tabIndex="0" onClick={() => inputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={drop}
        >
          <input ref={inputRef} type="file" accept={accept} onChange={pick} style={{ display: "none" }} />
          <UploadCloud size={28} />
          <span>{activeDropText}</span>
          <span className="muted" style={{ fontSize: "0.8rem" }}>JPEG, PNG, WebP — max 5 MB</span>
        </div>
      ) : null}

      {!hasCurrent && !hasPending && mode === "url" ? (
        <div className="upload-url-row">
          <input type="url" placeholder={activeUrlPlaceholder} value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyUrl() }} />
          <button className="primary-button" type="button" onClick={applyUrl} disabled={!urlInput.trim()}>Apply</button>
        </div>
      ) : null}
    </div>
  )
}
