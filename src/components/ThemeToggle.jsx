import { Moon, Sun } from "lucide-react"
import { useTheme } from "../context/themeContextValue"

export function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"
  const label = isDark ? "Switch to light mode" : "Switch to dark mode"
  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}