import { createContext, useContext } from "react"

export const TableContext = createContext(null)

export function useTable() {
  const value = useContext(TableContext)
  if (!value) throw new Error("useTable must be used inside TableProvider")
  return value
}

