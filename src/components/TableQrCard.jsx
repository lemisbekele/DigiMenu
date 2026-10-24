import { useEffect, useState } from "react"
import { useConfirm } from "../hooks/useConfirm"
import { Printer, Download, Share2, Trash2, Check, Save } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useParams } from "react-router-dom"
import { tableUrl } from "../services/tableUrl"

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function TableQrCard({ table, onDelete, onSave }) {
  const [confirm, confirmDialog] = useConfirm()
  const { cafeSlug } = useParams()
  const [printTitle, setPrintTitle] = useState(table.printTitle || "")
  const [printNote, setPrintNote] = useState(table.printNote || "")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saveError, setSaveError] = useState("")
  const url = tableUrl(table.tableNumber, cafeSlug)

  useEffect(() => {
    setPrintTitle(table.printTitle || "")
    setPrintNote(table.printNote || "")
  }, [table.printNote, table.printTitle])

  const savePrintCopy = async (event) => {
    event.preventDefault()
    if (!onSave) return
    setSaving(true)
    setSaveError("")
    try {
      await onSave({ ...table, printTitle, printNote })
    } catch {
      setSaveError("Could not save the printed text. Please retry.")
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
      // Clipboard blocked: show the link so it can be copied by hand.
      window.prompt("Copy this table link:", url)
    }
  }

  return (
    <article className="ad-qr-card">
      {confirmDialog}
      <h3>{table.label || `Table ${table.tableNumber}`}</h3>
      <div className="ad-qr-code" id={`qr-${table.id}`}>
        <QRCodeSVG id={`qr-svg-${table.id}`} value={url} size={220} level="H" includeMargin={true} bgColor="#FFFFFF" fgColor="#111827" />
      </div>
      <p className="ad-qr-url">{url}</p>

      <div className="oc-actions">
        <button className="oc-main" type="button" onClick={handlePrint}>
          <Printer size={18} /> Print
        </button>
        <button className="ad-icon" type="button" onClick={handleDownload} aria-label="Download QR code" title="Download">
          <Download size={18} />
        </button>
        <button className="ad-icon" type="button" onClick={handleShare} aria-label={copied ? "Link copied" : "Copy or share link"} title={copied ? "Copied" : "Copy link"}>
          {copied ? <Check size={18} /> : <Share2 size={18} />}
        </button>
        {onDelete ? (
          <button
            className="ad-icon oc-danger"
            type="button"
            aria-label={`Delete ${table.label || `Table ${table.tableNumber}`}`}
            title="Delete table"
            onClick={async () => {
              if (!(await confirm(`Delete Table ${table.tableNumber} and its QR code? Links printed on existing cards will stop working.`, { title: "Delete table?" }))) return
              onDelete(table.id)
            }}
          >
            <Trash2 size={18} />
          </button>
        ) : null}
      </div>

      {onSave ? (
        <details>
          <summary>Edit the printed text</summary>
          <form className="ad-form" onSubmit={savePrintCopy}>
            <label className="ad-field">
              Heading
              <input maxLength={120} value={printTitle} onChange={(event) => setPrintTitle(event.target.value)} placeholder="Scan to Order" />
            </label>
            <label className="ad-field">
              Instructions
              <input maxLength={300} value={printNote} onChange={(event) => setPrintNote(event.target.value)} placeholder="Point your phone camera to view the menu" />
            </label>
            <button className="oc-quiet" type="submit" disabled={saving}>
              <Save size={16} /> {saving ? "Saving…" : "Save text"}
            </button>
            {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
          </form>
        </details>
      ) : null}
    </article>
  )
}
