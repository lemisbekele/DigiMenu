export function PageHeader({ title, subtitle, action }) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header-text">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div className="ui-page-header-action">{action}</div> : null}
    </header>
  )
}
