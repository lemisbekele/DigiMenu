import { EmptyState } from "./EmptyState"

// columns: [{ key, label, align?: "right", render?(row) }]. Cells stay on one line; plain values keep their full text in title.
export function DataTable({ columns, rows, rowKey, empty }) {
  if (!rows.length) return <EmptyState {...empty} />
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} data-align={c.align}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              {columns.map((c) => {
                const plain = !c.render
                const content = plain ? row[c.key] : c.render(row)
                return <td key={c.key} data-align={c.align} data-label={c.label || undefined} title={plain && content != null ? String(content) : undefined}>{content}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
