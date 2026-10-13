import { useNavigate } from "react-router-dom"
import { Languages, Lock } from "lucide-react"
import { useLanguage } from "../context/languageContextValue"
import { usePlan } from "../context/planContextValue"
import { ThemeToggle } from "./ThemeToggle"

const languages = [
  { code: "en", label: "EN", title: "English" },
  { code: "am", label: "አማ", title: "አማርኛ" },
  { code: "om", label: "AO", title: "Afaan Oromo" },
]

export function LanguageToggle({ inline = false, publicSite = false }) {
  const { language, setLanguage, t } = useLanguage()
  const { hasFeature } = usePlan()
  const navigate = useNavigate()
  const isUnlocked = publicSite || hasFeature("multiLanguage")

  const activeIndex = languages.findIndex((item) => item.code === language)
  const active = languages[Math.max(activeIndex, 0)]
  const next = languages[(Math.max(activeIndex, 0) + 1) % languages.length]
  const label = isUnlocked
    ? t("languageSwitch", { active: active.title, next: next.title })
    : t("languageLocked", "Language options depend on your cafe's package")

  const handleClick = () => {
    if (!isUnlocked) {
      navigate("/pricing?locked=multiLanguage")
      return
    }
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
        style={{ opacity: isUnlocked ? 1 : 0.8 }}
      >
        <Languages size={17} />
        <span>{active.label}</span>
        {!isUnlocked ? <Lock size={12} style={{ marginLeft: 4, color: "#facc15" }} /> : null}
      </button>
      <ThemeToggle />
    </div>
  )
}

