import { useEffect, useState } from "react"
import { Printer, Download, Share2, Trash2, Check, Save } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useParams } from "react-router-dom"
import { tableUrl } from "../services/tableUrl"
import { BrandLogo } from "./BrandLogo"

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function TableQrCard({ table, onDelete, onSave }) {
  const { cafeSlug } = useParams()
  const [printTitle, setPrintTitle] = useState(table.printTitle || "")
  const [printNote, setPrintNote] = useState(table.printNote || "")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const url = tableUrl(table.tableNumber, cafeSlug)

  useEffect(() => {
    setPrintTitle(table.printTitle || "")
    setPrintNote(table.printNote || "")
  }, [table.printNote, table.printTitle])

  const savePrintCopy = async (event) => {
    event.preventDefault()
    if (!onSave) return
    setSaving(true)
    try {
      await onSave({ ...table, printTitle, printNote })
    } catch {
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = () => {
    const label = escapeHtml(table.label || `Table ${table.tableNumber}`)
    const title = escapeHtml(printTitle || "Scan to Order")
    const note = escapeHtml(printNote || "Point your phone camera to view the menu and place your order")
    const safeUrl = escapeHtml(url)
    const svgContent = document.getElementById(`qr-svg-${table.id}`)?.outerHTML || ""

    const printWindow = window.open("", "_blank", "width=800,height=950")
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${label} - QR Code</title>
          <style>
            @page {
              size: A5 portrait;
              margin: 10mm;
            }
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #111827;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            .a5-container {
              width: 148mm;
              height: 210mm;
              padding: 12mm 10mm;
              border: 3px double #34821b;
              border-radius: 12px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              text-align: center;
              box-shadow: none;
              background: #ffffff;
            }
            .brand-header {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 4px;
            }
            .brand-header img {
              height: 42px;
              width: auto;
            }
            .brand-sub {
              font-size: 11px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #286b14;
              font-weight: 700;
            }
            .table-badge {
              background: #286b14;
              color: #ffffff;
              font-size: 28px;
              font-weight: 800;
              padding: 6px 28px;
              border-radius: 9999px;
              letter-spacing: 0.05em;
              margin: 8px 0;
            }
            .custom-title {
              font-size: 18px;
              font-weight: 600;
              color: #1f2937;
              margin: 0;
            }
            .qr-frame {
              background: #ffffff;
              padding: 16px;
              border: 2px solid #e5e7eb;
              border-radius: 16px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.05);
              margin: 12px 0;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .qr-frame svg {
              width: 240px !important;
              height: 240px !important;
              display: block;
            }
            .instructions {
              font-size: 14px;
              color: #4b5563;
              max-width: 110mm;
              line-height: 1.4;
              margin: 0;
            }
            .url-footer {
              font-size: 11px;
              color: #9ca3af;
              font-family: monospace;
              word-break: break-all;
              margin-top: 4px;
            }
            .powered-by-footer {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              margin-top: 12px;
              padding-top: 10px;
              font-size: 13px;
              color: #4b5563;
              font-weight: 600;
              letter-spacing: 0.02em;
            }
            .powered-by-footer img {
              height: 52px;
              width: auto;
              margin-top: 30px;
            }
            @media print {
              body { min-height: auto; }
              .a5-container {
                width: 100%;
                height: 100%;
                border: 2px solid #34821b;
              }
            }
          </style>
        </head>
        <body>
          <div class="a5-container">
            <div class="table-badge">${label}</div>
            
            ${title ? `<p class="custom-title">${title}</p>` : ""}
            
            <div class="qr-frame">
              ${svgContent}
            </div>
            
            ${note ? `<p class="instructions">${note}</p>` : ""}
            
            <div class="url-footer">${safeUrl}</div>

            <div class="powered-by-footer">
              <span>Powered by</span>
              <img src="/digimenu-mark.svg" alt="" /><strong>DigiMenu</strong>
            </div>
          </div>
        </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  const handleDownload = () => {
    const svg = document.getElementById(`qr-svg-${table.id}`)
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
    const svgUrl = URL.createObjectURL(svgBlob)

    const downloadLink = document.createElement("a")
    downloadLink.href = svgUrl
    downloadLink.download = `Table-${table.tableNumber}-QR.svg`
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
    URL.revokeObjectURL(svgUrl)
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Table ${table.tableNumber} Menu`,
          text: `Scan to order from Table ${table.tableNumber}`,
          url: url,
        })
        return
      } catch (err) {
        if (err.name !== "AbortError") console.error(err)
      }
    }

    // Fallback: Copy link
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert(`Table Link: ${url}`)
    }
  }

  return (
    <article className="qr-card a5-preview-card">
      <div className="a5-card-inner">
        <div className="a5-card-header">
          <span className="a5-badge">A5 Print Format</span>
          <h3 className="a5-table-label">{table.label || `Table ${table.tableNumber}`}</h3>
        </div>

        <div className="qr-wrap enlarged-qr-container" id={`qr-${table.id}`}>
          <QRCodeSVG
            id={`qr-svg-${table.id}`}
            value={url}
            size={220}
            level="H"
            includeMargin={true}
            bgColor="#FFFFFF"
            fgColor="#111827"
          />
        </div>

        <div className="a5-url-display">
          <span>{url}</span>
        </div>

        {onSave ? <form className="qr-copy-form compact-form" onSubmit={savePrintCopy}>
          <div className="form-fields-row">
            <label>QR heading<input maxLength={120}
              value={printTitle}
              onChange={(event) => setPrintTitle(event.target.value)}
              placeholder="Custom heading (e.g. Scan to Order)"
            /></label>
            <label>QR instructions<input maxLength={300}
              value={printNote}
              onChange={(event) => setPrintNote(event.target.value)}
              placeholder="Custom instruction note..."
            /></label>
          </div>
          <button className="secondary-button save-copy-btn" type="submit" disabled={saving}>
            <Save size={14} />
            {saving ? "Saving..." : "Save details"}
          </button>
        </form> : null}

        <div className="qr-action-toolbar">
          <button className="primary-button action-btn" type="button" onClick={handlePrint} title="Print A5 Card">
            <Printer size={16} />
            <span>Print A5</span>
          </button>

          <button className="ghost-button action-btn" type="button" onClick={handleDownload} title="Download SVG">
            <Download size={16} />
            <span>Download</span>
          </button>

          <button className="ghost-button action-btn" type="button" onClick={handleShare} title="Share Link">
            {copied ? <Check size={16} style={{ color: "#286b14" }} /> : <Share2 size={16} />}
            <span>{copied ? "Copied!" : "Share"}</span>
          </button>

          {onDelete ? (
            <button
              className="icon-button danger action-btn-delete"
              type="button"
              onClick={() => {
                if (!window.confirm(`Delete Table ${table.tableNumber} and its QR code? Links printed on existing cards will stop working.`)) return
                onDelete(table.id)
              }}
              title="Delete Table"
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>

        <div className="powered-by-row">
          <span>Powered by</span>
          <BrandLogo size="medium" />
        </div>
      </div>
    </article>
  )
}
