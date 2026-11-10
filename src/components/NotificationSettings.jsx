import { toUserMessage } from "../services/userMessages"
import { Bell, CheckCircle2, RefreshCw } from "lucide-react"
import { useLanguage } from "../context/languageContextValue"
import { getPermission, subscribeToPush, getExistingSubscription } from "../services/notificationService"
import { useState, useEffect } from "react"

export function NotificationSettings({ buttonLabel = "", orderId = null, role = "customer", compact = false }) {
  const { t } = useLanguage()
  const [status, setStatus] = useState(() => getPermission())
  const [busy, setBusy] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    getExistingSubscription()
      .then((sub) => { if (active) setSubscribed(!!sub) })
      .catch((err) => { if (active) setError(toUserMessage(err, "We couldn’t check notifications. Please try enabling them again.")) })
    return () => { active = false }
  }, [])

  const enable = async () => {
    setBusy(true)
    setError("")
    try {
      await subscribeToPush({ orderId, role })
      setStatus("granted")
      setSubscribed(true)
    } catch (err) {
      setError(toUserMessage(err))
      setStatus(getPermission())
    } finally {
      setBusy(false)
    }
  }

  if (status === "unsupported") return null
  if (status === "granted" && subscribed) {
    return (
      <div className={`notification-settings ${compact ? "compact" : ""}`}>
        <span className="notif-granted-pill">
          <CheckCircle2 size={14} style={{ color: "var(--accent)" }} />
          <span>{subscribed ? t("pushOn") : "Notifications active"}</span>
        </span>
      </div>
    )
  }
  if (status === "denied") {
    return (
      <div className={`notification-settings ${compact ? "compact" : ""}`}>
        <div className="notif-blocked">
          <p style={{ margin: 0, fontSize: "0.8rem" }}>Notifications are off in your browser settings</p>
          <button className="enable-notif-btn small" type="button" onClick={() => setStatus(getPermission())}>
            <RefreshCw size={12} /> Check again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`notification-settings ${compact ? "compact" : ""}`}>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="enable-notif-btn" type="button" onClick={enable} disabled={busy}>
        <Bell size={15} />
        <span>{busy ? t("saving") || "Enabling\u2026" : buttonLabel || t("enableReadyNotification")}</span>
      </button>
    </div>
  )
}
