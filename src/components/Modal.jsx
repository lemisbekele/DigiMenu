import { useEffect, useId, useRef } from "react"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

export function Modal({ title, onClose, busy = false, children, className = "" }) {
  const ref = useRef(null)
  const titleId = useId()
  const { t } = useTranslation()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute("open", "")
    return () => { dialog.close?.(); previous?.focus?.() }
  }, [])
  return <dialog ref={ref} className={`ui-dialog ${className}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="ui-dialog-head"><h2 id={titleId}>{title}</h2>
      <button type="button" className="ui-btn ui-btn--quiet ui-btn--icon" disabled={busy} onClick={onClose} aria-label={t("close")}><X size={20} /></button>
    </header>{children}
  </dialog>
}
