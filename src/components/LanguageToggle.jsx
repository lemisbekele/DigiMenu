import { Languages } from "lucide-react"
import { useLanguage } from "../context/languageContextValue"
import { ThemeToggle } from "./ThemeToggle"

const languages = [
  { code: "en", label: "EN", title: "English" },
  { code: "am", label: "አማ", title: "አማርኛ" },
  { code: "om", label: "AO", title: "Afaan Oromo" },
]

export function LanguageToggle({ inline = false, publicSite: _publicSite = false }) {
  const { language, setLanguage, t } = useLanguage()

  const activeIndex = languages.findIndex((item) => item.code === language)
  const active = languages[Math.max(activeIndex, 0)]
  const next = languages[(Math.max(activeIndex, 0) + 1) % languages.length]
  const label = t("languageSwitch", { active: active.title, next: next.title })

  const handleClick = () => {
    setLanguage(next.code)
  }

  return (
    <div className={inline ? "inline-page-controls" : "page-controls"}>
      <button
        className="language-toggle"
        type="button"
        aria-label={label}
        title={label}
        onClick={handleClick}
      >
        <Languages size={17} />
        <span>{active.label}</span>
      </button>
      <ThemeToggle />
    </div>
  )
}

