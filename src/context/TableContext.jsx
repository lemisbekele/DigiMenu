import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { TableContext } from "./tableContextValue"

export function TableProvider({ children }) {
  const [searchParams] = useSearchParams()
  const rawTable = searchParams.get("table")
  const tableNumber = rawTable && Number(rawTable) > 0 ? Number(rawTable) : null

  const value = useMemo(() => ({ tableNumber }), [tableNumber])
  return <TableContext.Provider value={value}>{children}</TableContext.Provider>
}

