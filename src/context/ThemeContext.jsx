import { useCallback, useLayoutEffect, useMemo, useState } from "react"
import { ThemeContext } from "./themeContextValue"

const STORAGE_KEY = "cafe-theme"

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch {}
  return null
}

function resolveInitialTheme() {
  return readStoredTheme() || "light"
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(resolveInitialTheme)

  // Apply the attribute before paint to avoid a flash of the wrong theme.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-theme", theme)
    root.style.colorScheme = theme
  }, [theme])

  const setThemeMode = useCallback((next) => {
    const target = next === "dark" ? "dark" : "light"
    setTheme(target)
    try {
      localStorage.setItem(STORAGE_KEY, target)
    } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark"
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {}
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme: setThemeMode, toggleTheme }),
    [theme, setThemeMode, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
