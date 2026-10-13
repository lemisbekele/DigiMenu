import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { LanguageContext } from "./languageContextValue"
import { useAuth } from "./authContextValue"
import { fetchUserLanguage, saveUserLanguage } from "../services/dataService"

function cacheKey(uid) {
  return uid ? `cafe-language-${uid}` : "cafe-language-guest"
}

function loadCachedLanguage(uid) {
  try {
    return localStorage.getItem(cacheKey(uid)) || ""
  } catch {
    return ""
  }
}

function saveCachedLanguage(uid, lang) {
  try {
    localStorage.setItem(cacheKey(uid), lang)
  } catch {}
}

export function LanguageProvider({ children }) {
  const { i18n, t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.id || null
  const [language, setLanguageState] = useState(() => {
    const cached = uid ? loadCachedLanguage(uid) : loadCachedLanguage(null)
    return cached || i18n.resolvedLanguage || i18n.language || "en"
  })
  const syncedUid = useRef(undefined)

  const applyLanguage = useCallback((lang) => {
    const target = ["en", "am", "om"].includes(lang) ? lang : "en"
    i18n.changeLanguage(target)
    setLanguageState(target)
  }, [i18n])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = i18n.dir(language)
  }, [language, i18n])

  const changeLanguage = useCallback(async (nextLanguage) => {
    const target = nextLanguage || "en"
    applyLanguage(target)

    if (uid) {
      saveCachedLanguage(uid, target)
      try {
        await saveUserLanguage(uid, target)
        syncedUid.current = uid
      } catch {}
    } else {
      saveCachedLanguage(null, target)
    }
  }, [uid, applyLanguage])

  useEffect(() => {
    if (syncedUid.current === uid) return

    if (!uid) {
      const cached = loadCachedLanguage(null)
      if (cached && cached !== i18n.resolvedLanguage) {
        applyLanguage(cached)
      }
      syncedUid.current = null
      return
    }

    const cached = loadCachedLanguage(uid)
    if (cached && cached !== language && syncedUid.current !== uid) {
      applyLanguage(cached)
      syncedUid.current = uid
      return
    }

    let active = true
    fetchUserLanguage(uid).then((dbLang) => {
      if (!active) return
      const target = dbLang || "en"
      if (target !== (i18n.resolvedLanguage || i18n.language || "en")) {
        saveCachedLanguage(uid, target)
        applyLanguage(target)
      }
      syncedUid.current = uid
    }).catch(() => {
      if (active) syncedUid.current = uid
    })
    return () => { active = false }
  }, [uid, applyLanguage, i18n, language])

  const value = useMemo(
    () => ({ language, setLanguage: changeLanguage, t }),
    [language, changeLanguage, t],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
