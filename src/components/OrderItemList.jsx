import { AlertTriangle } from "lucide-react"
import { itemChanges } from "../services/dataService"

// Compact item list for staff order cards: quantity, name, what changed, customer note.
export function OrderItemList({ items = [] }) {
  return (
    <ul className="oc-items">
      {items.map((item, i) => (
        <li key={i}>
          <span className="oc-qty">{item.quantity || 1}×</span>
          <div>
            <span className="oc-name">{item.name}</span>
            {itemChanges(item).map((text) => <span key={text} className="oc-change">{text}</span>)}
            {item.notes ? <span className="oc-note"><AlertTriangle size={13} /> {item.notes}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
