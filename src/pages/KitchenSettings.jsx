import { useEffect, useState } from "react"
import { Bell, Globe, Moon, Sun, Volume2 } from "lucide-react"
import { LogoutButton } from "../components/LogoutButton"
import { useLanguage } from "../context/languageContextValue"
import {
  getPermission,
  requestPermission,
  subscribeToPush,
} from "../services/notificationService"

const STORAGE_PREFIX = "kitchen-settings-"

function loadSetting(key, fallback) {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + key)
    return val !== null ? JSON.parse(val) : fallback
  } catch {
    return fallback
  }
}

function saveSetting(key, value) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
}

export function KitchenSettings() {
  const { language, setLanguage: setUserLanguage } = useLanguage()

  const [soundAlerts, setSoundAlerts] = useState(() => loadSetting("soundAlerts", true))
  const [desktopNotifs, setDesktopNotifs] = useState(() => loadSetting("desktopNotifs", true))
  const [darkMode, setDarkMode] = useState(() => loadSetting("darkMode", false))
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("")

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark-mode")
    } else {
      document.documentElement.classList.remove("dark-mode")
    }
  }, [darkMode])

  const toggle = (key, value, setter) => {
    setter(value)
    saveSetting(key, value)
  }

  return (
    <div className="admin-stack kds-settings-page">
      <div className="admin-head">
        <div>
          <p className="eyebrow">Barista / Kitchen</p>
          <h2>Settings</h2>
          <p className="admin-hint">Alerts, appearance and language for this device.</p>
        </div>
      </div>

      <section className="admin-form settings-panel kds-settings-section">
        <p className="eyebrow"><Bell size={13} style={{ verticalAlign: -1 }} /> Notifications</p>
        <h2>Preferences</h2>
        <div className="notification-settings" style={{ marginTop: 8 }}>
          <label className="auto-ready-toggle">
            <input type="checkbox" checked={soundAlerts} onChange={(e) => toggle("soundAlerts", e.target.checked, setSoundAlerts)} />
            <Volume2 size={16} /> Sound alerts for new orders
          </label>
          <label className="auto-ready-toggle">
            <input type="checkbox" checked={desktopNotifs} onChange={async (e) => {
              if (e.target.checked) {
                const perm = getPermission()
                if (perm === "default") {
                  const result = await requestPermission()
                  if (result !== "granted") return
                } else if (perm === "denied") {
                  setMessage("Notifications are blocked in browser settings. Enable them manually.")
                  setMessageType("error")
                  return
                }
                try {
                  await subscribeToPush({ role: "barista" })
                } catch {
                  setMessage("Could not subscribe to push notifications.")
                  setMessageType("error")
                }
              }
              toggle("desktopNotifs", e.target.checked, setDesktopNotifs)
            }} />
            <Bell size={16} /> Desktop push notifications
          </label>
          <label className="auto-ready-toggle">
            <input type="checkbox" checked={darkMode} onChange={(e) => toggle("darkMode", e.target.checked, setDarkMode)} />
            {darkMode ? <Moon size={16} /> : <Sun size={16} />} Dark mode
          </label>
        </div>
        {message ? (
          <p className={messageType === "error" ? "form-error" : "success-note"} style={{ marginTop: 8 }}>{message}</p>
        ) : null}
      </section>

      <section className="admin-form settings-panel kds-settings-section">
        <p className="eyebrow"><Globe size={13} style={{ verticalAlign: -1 }} /> Regional</p>
        <h2>Language</h2>
        <label className="field" style={{ marginTop: 8 }}>
          <span>Interface language</span>
          <select value={language} onChange={(e) => setUserLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="am">አማርኛ (Amharic)</option>
            <option value="om">Afaan Oromo</option>
          </select>
        </label>
      </section>

      <hr className="kds-settings-divider" />
      <div className="kds-settings-signout">
        <LogoutButton />
      </div>
    </div>
  )
}
