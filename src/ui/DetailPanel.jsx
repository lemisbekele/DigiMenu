import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

// The thing being worked on (an open order, an item being edited), shown in the frame's right column.
// Renders into the slot RoleLayout provides; outside that frame it renders in place.
export function DetailPanel({ title, children, onClose }) {
  const [slot, setSlot] = useState(null)
  const [looked, setLooked] = useState(false)
  useEffect(() => { setSlot(document.getElementById("ui-detail-slot")); setLooked(true) }, [])
  if (!looked) return null
  const panel = (
    <div className="ui-panel">
      <header className="ui-panel-head">
        <h2>{title}</h2>
        {onClose ? <button type="button" className="ui-btn ui-btn--quiet ui-btn--icon" onClick={onClose} aria-label="Close"><X size={16} /></button> : null}
      </header>
      {children}
    </div>
  )
  return slot ? createPortal(panel, slot) : panel
}
