import { useCallback, useState } from "react"
import { Modal } from "../components/Modal"

// In-app replacement for window.confirm: `if (!(await confirm("Delete X?"))) return`.
// Render the returned dialog element somewhere in the component.
export function useConfirm() {
  const [request, setRequest] = useState(null)

  const confirm = useCallback(
    (message, { title = "Are you sure?", confirmLabel = "Delete" } = {}) =>
      new Promise((resolve) => setRequest({ message, title, confirmLabel, resolve })),
    [],
  )

  const answer = (ok) => {
    request?.resolve(ok)
    setRequest(null)
  }

  const dialog = request ? (
    <Modal title={request.title} className="confirm-dialog" onClose={() => answer(false)}>
      <p>{request.message}</p>
      <div className="row-actions">
        <button type="button" className="danger-button" onClick={() => answer(true)}>{request.confirmLabel}</button>
        <button type="button" className="ghost-button" autoFocus onClick={() => answer(false)}>Cancel</button>
      </div>
    </Modal>
  ) : null

  return [confirm, dialog]
}
