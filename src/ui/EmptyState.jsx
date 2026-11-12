export function EmptyState({ title, body, action }) {
  return (
    <div className="ui-empty">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action || null}
    </div>
  )
}
