import { useEffect, useState } from "react"
import { Bell, ChefHat, Globe, Moon, Sun, Volume2 } from "lucide-react"
import { LogoutButton } from "../components/LogoutButton"
import { useLanguage } from "../context/languageContextValue"
import { useTheme } from "../context/themeContextValue"
import {
  getPermission,
  requestPermission,
  subscribeToPush,
} from "../services/notificationService"
import { fetchKitchenCapacity, saveKitchenCapacity } from "../services/dataService"
import { DEFAULT_KITCHEN_CAPACITY } from "../services/kitchenQueue"

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

import "./service-layout.css"
import "./staff-layout.css"
export function KitchenSettings() {
  const { language, setLanguage: setUserLanguage } = useLanguage()

  const [soundAlerts, setSoundAlerts] = useState(() => loadSetting("soundAlerts", true))
  const [desktopNotifs, setDesktopNotifs] = useState(() => loadSetting("desktopNotifs", true))
  // Same theme setting as the rest of the app, so it survives reloads and matches every screen.
  const { theme, setTheme } = useTheme()
  const darkMode = theme === "dark"
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("")
  const [capacity, setCapacity] = useState(DEFAULT_KITCHEN_CAPACITY)
  const [capacityNote, setCapacityNote] = useState("")

  useEffect(() => { fetchKitchenCapacity().then(setCapacity).catch(() => {}) }, [])

  const changeCapacity = async (value) => {
    setCapacity(value)
    try {
      await saveKitchenCapacity(value)
      setCapacityNote("Saved for the whole cafe.")
    } catch (err) {
      setCapacityNote(err.message)
    }
  }

  const toggle = (key, value, setter) => {
    setter(value)
    saveSetting(key, value)
  }

  return (
    <div className="ui-stack kds-settings-page">
      <div className="ui-page-header">
        <div className="ui-page-header-text">
          <h1>Settings</h1>
          <p>Alerts, appearance and language for this device.</p>
        </div>
      </div>

      <section className="ui-card ui-card--stack">
        <h2>Preferences</h2>
        <div className="notification-settings">
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
            <input type="checkbox" checked={darkMode} onChange={(e) => setTheme(e.target.checked ? "dark" : "light")} />
            {darkMode ? <Moon size={16} /> : <Sun size={16} />} Dark mode
          </label>
        </div>
        {message ? (
          <p className={messageType === "error" ? "ui-error" : "ad-success"}>{message}</p>
        ) : null}
      </section>

      <section className="ui-card ui-card--stack">
        <h2>Orders in progress at once</h2>
        <label className="ui-field">
          <span>The oldest this many orders show as "Preparing"; the rest wait in line. Customers' wait times use this number.</span>
          <select value={capacity} onChange={(e) => changeCapacity(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {capacityNote ? <p className="ui-muted" role="status">{capacityNote}</p> : null}
      </section>

      <section className="ui-card ui-card--stack">
        <h2>Language</h2>
        <label className="ui-field">
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
