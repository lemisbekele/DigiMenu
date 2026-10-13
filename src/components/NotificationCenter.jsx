import { useCallback } from "react"
import { useEffect, useId, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, CheckCheck, Trash2, X } from "lucide-react"
import {
  subscribeNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
} from "../services/notificationService"

import { useParams } from "react-router-dom"
import { useAuth } from "../context/authContextValue"

export function NotificationCenter() {
  const navigate = useNavigate()
  const { cafeSlug: authCafeSlug, user, role } = useAuth()
  const { cafeSlug: routeCafeSlug } = useParams()
  const cafeSlug = routeCafeSlug || authCafeSlug || ""
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const root = useRef(null)
  const trigger = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    const closeOnEscape = event => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener("pointerdown", closeOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    return subscribeNotifications((stored) => {
      setNotifications(stored)
      setUnread(stored.filter((n) => !n.read).length)
    })
  }, [user?.id])

  const routeForEvent = useCallback((event) => {
    const base = `/${cafeSlug}`
    if (!event) return null
    if (role === "superadmin") return "/superadmin/dashboard"
    if (role === "barista") return `${base}/kds`
    if (role === "cashier") return `${base}/pos`
    if (event.startsWith("order.") || event.startsWith("payment.") || event === "discount.applied") return `${base}/orders`
    if (event.startsWith("inventory.")) return `${base}/inventory`
    if (event === "role.change") return `${base}/users`
    return `${base}/orders`
  }, [cafeSlug, role])

  const handleClick = (n) => {
    markNotificationRead(n.id)
    setOpen(false)
    const route = routeForEvent(n.event)
    if (route) navigate(route)
  }

  return (
    <div className="notification-center" ref={root}>
      <button ref={trigger} className="ghost-button notify-bell" type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <Bell size={18} />
        {unread ? <span className="notify-count">{unread}</span> : null}
      </button>
      {open ? (
        <aside className="notification-dropdown" id={panelId} aria-label="Notifications">
          <div className="notify-head">
            <strong>Notifications</strong>
            <div className="notify-actions">
              {unread ? (
                <button className="ghost-button small" type="button" aria-label="Mark all notifications read" onClick={markAllNotificationsRead}>
                  <CheckCheck size={14} /> <span className="hide-mobile">Mark all read</span>
                </button>
              ) : null}
              <button className="ghost-button small" type="button" aria-label="Clear notifications" onClick={clearNotifications}>
                <Trash2 size={14} /> <span className="hide-mobile">Clear</span>
              </button>
              <button className="icon-button small" type="button" aria-label="Close notifications" onClick={() => { setOpen(false); trigger.current?.focus() }}>
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="notify-body">
            {notifications.length === 0 ? (
              <div className="empty-state">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  className={`notify-item ${n.read ? "" : "unread"}`}
                  key={n.id}
                  onClick={() => handleClick(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(n) }
                  }}
                >
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <span className="notify-time">{new Date(n.createdAtMs || n.createdAt).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      ) : null}
    </div>
  )
}
