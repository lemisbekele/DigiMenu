import { savePushSubscription } from "./dataService"
import { supabase } from "./supabase"

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

function isSupported() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false
  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) return false
  return true
}

let _swRegistration = null
let _subscription = null

function waitForActive(registration) {
  if (registration.active) return registration
  const worker = registration.installing || registration.waiting
  if (!worker) return navigator.serviceWorker.ready.then((r) => r.active ? r : Promise.reject(new Error("SW not active")))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { worker.removeEventListener("statechange", onChange); reject(new Error("SW activation timed out")) }, 10000)
    function onChange() {
      if (worker.state === "activated") { clearTimeout(timer); worker.removeEventListener("statechange", onChange); resolve(registration) }
      if (worker.state === "redundant") { clearTimeout(timer); worker.removeEventListener("statechange", onChange); reject(new Error("SW became redundant")) }
    }
    worker.addEventListener("statechange", onChange)
  })
}

export async function registerServiceWorker() {
  if (_swRegistration) return _swRegistration
  if (!isSupported()) return null
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    reg.update?.()
    const active = await waitForActive(reg)
    _swRegistration = active
    return active
  } catch (err) {
    console.info("Service worker registration skipped:", err?.message || err)
    return null
  }
}

export function getPermission() {
  if (!isSupported()) return "unsupported"
  return Notification.permission
}

export async function requestPermission() {
  if (!isSupported()) return "unsupported"
  if (Notification.permission !== "default") return Notification.permission
  const result = await Notification.requestPermission()
  return result
}

export async function getExistingSubscription() {
  if (_subscription) return _subscription
  try {
    const reg = await registerServiceWorker()
    const sub = await reg.pushManager.getSubscription()
    _subscription = sub
    return sub
  } catch {
    return null
  }
}

export async function subscribeToPush({ orderId = null, role = "customer" } = {}) {
  if (!isSupported()) throw new Error("Notifications not supported")
  if (!VAPID_KEY) throw new Error("VAPID public key not configured")

  const permission = await requestPermission()
  if (permission !== "granted") throw new Error("Permission denied")

  const reg = await registerServiceWorker()
  const existing = await reg.pushManager.getSubscription()
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
  })

  await savePushSubscription({ orderId, role, subscription: sub.toJSON() })
  _subscription = sub
  return sub
}

export async function unsubscribeFromPush() {
  const sub = await getExistingSubscription()
  if (sub) {
    await sub.unsubscribe()
    _subscription = null
  }
}

export async function showBrowserNotification(title, options = {}) {
  if (!isSupported() || Notification.permission !== "granted") return
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg && reg.showNotification) {
        await reg.showNotification(title, { icon: "/favicon.svg", badge: "/favicon.svg", ...options })
        return
      }
    }
    new Notification(title, { icon: "/favicon.svg", badge: "/favicon.svg", ...options })
  } catch {
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready
        if (reg && reg.showNotification) {
          await reg.showNotification(title, { icon: "/favicon.svg", badge: "/favicon.svg", ...options })
        }
      }
    } catch {
      /* best-effort */
    }
  }
}

export function getPermissionLabel(permission) {
  if (permission === "granted") return "Granted"
  if (permission === "denied") return "Blocked"
  if (permission === "default") return "Not asked"
  return "Unsupported"
}

const MAX_STORED = 100
let notificationUser = null
let notifications = []
const changed = () => window.dispatchEvent(new CustomEvent("cafe-notifications-updated"))
export function setNotificationUser(userId) {
  if (notificationUser === userId) return
  notificationUser = userId
  notifications = []
  changed()
}

export function getStoredNotifications() {
  return notifications
}

export function createNotification({ event, title, body, data = {}, role = null }) {
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    event, title, body, data, role,
    read: false,
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now(),
  }
}

export function addNotification(notification) {
  const stored = getStoredNotifications()
  const updated = [notification, ...stored].slice(0, MAX_STORED)
  // Staff history comes from database triggers; local customer notifications
  // last only for the current browser session.
  if (!notificationUser) notifications = updated
  window.dispatchEvent(new CustomEvent("cafe-notifications-updated"))
  return updated
}

export async function markNotificationRead(notificationId) {
  if (notificationUser) {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", notificationId).eq("user_id", notificationUser)
    if (error) return
  }
  const stored = getStoredNotifications()
  const updated = stored.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
  notifications = updated
  window.dispatchEvent(new CustomEvent("cafe-notifications-updated"))
}

export async function markAllNotificationsRead() {
  if (notificationUser) {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", notificationUser)
    if (error) return
  }
  const stored = getStoredNotifications()
  const updated = stored.map((n) => ({ ...n, read: true }))
  notifications = updated
  window.dispatchEvent(new CustomEvent("cafe-notifications-updated"))
}

export async function clearNotifications() {
  if (notificationUser) {
    const { error } = await supabase.from("notifications").delete().eq("user_id", notificationUser)
    if (error) return
  }
  notifications = []
  window.dispatchEvent(new CustomEvent("cafe-notifications-updated"))
}

export function removeNotificationsByOrderId(orderId) {
  const stored = getStoredNotifications()
  const updated = stored.filter((n) => !(n.data?.orderId === orderId))
  notifications = updated
  window.dispatchEvent(new CustomEvent("cafe-notifications-updated"))
}

export function getUnreadCount() {
  return getStoredNotifications().filter((n) => !n.read).length
}

export function subscribeNotifications(callback) {
  const handler = () => callback(getStoredNotifications())
  window.addEventListener("cafe-notifications-updated", handler)
  handler()
  const userId = notificationUser
  let active = true
  const load = async () => {
    if (!userId) return
    const { data, error } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(MAX_STORED)
    if (!error && active && userId === notificationUser) {
      notifications = (data || []).map((n) => ({ ...n, createdAt: n.created_at, createdAtMs: new Date(n.created_at).getTime() }))
      handler()
    }
  }
  void load().catch(() => {})
  const channel = userId ? supabase.channel(`notifications-${userId}-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => { void load().catch(() => {}) }).subscribe() : null
  return () => { active = false; window.removeEventListener("cafe-notifications-updated", handler); if (channel) supabase.removeChannel(channel).catch(() => {}) }
}

export function playNotificationSound(priority = "normal") {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const isUrgent = priority === "urgent" || priority === "high"
    osc.type = isUrgent ? "sawtooth" : "sine"
    const freq = isUrgent ? 880 : 587.33
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    if (isUrgent) {
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.15)
    }
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isUrgent ? 0.4 : 0.25))
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (isUrgent ? 0.4 : 0.25))
    osc.onended = () => { void ctx.close() }
  } catch {
    /* web audio best-effort */
  }
}

export const NOTIFICATION_EVENTS = {
  ORDER_NEW: "order.new",
  ORDER_ACCEPTED: "order.accepted",
  ORDER_PREPARING: "order.preparing",
  ORDER_READY: "order.ready",
  ORDER_PAID: "order.paid",
  ORDER_REJECTED: "order.rejected",
  ORDER_CANCELLED: "order.cancelled",
  ORDER_HIGH_PRIORITY: "order.high_priority",
  PAYMENT_REQUESTED: "payment.requested",
  PAYMENT_PROOF_SUBMITTED: "payment.proof_submitted",
  PAYMENT_COMPLETED: "payment.completed",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_REJECTED: "payment.rejected",
  DISCOUNT_APPLIED: "discount.applied",
  INVENTORY_LOW: "inventory.low",
  INVENTORY_OUT: "inventory.out",
  EMPLOYEE_ATTENDANCE: "employee.attendance",
  SCHEDULE_UPDATE: "schedule.update",
  ANNOUNCEMENT: "announcement",
  ROLE_CHANGE: "role.change",
  SYSTEM_ALERT: "system.alert",
  AUDIT_EVENT: "audit.event",
}

const seenEventIds = new Set()

export function isDuplicateNotification(uniqueId) {
  if (!uniqueId) return false
  if (seenEventIds.has(uniqueId)) return true
  seenEventIds.add(uniqueId)
  if (seenEventIds.size > 500) {
    const iterator = seenEventIds.values()
    for (let i = 0; i < 100; i++) seenEventIds.delete(iterator.next().value)
  }
  return false
}

export function notifyOrderEvent(order, event, targetRole = "admin") {
  const isUrgent = Boolean(order?.priority === "urgent" || order?.priority === "high" || Number(order?.totalAmount || 0) > 2000)
  const messages = {
    [NOTIFICATION_EVENTS.ORDER_NEW]: {
      title: isUrgent ? "🚨 Urgent New Order" : "New Order Received",
      body: `Table ${order.tableNumber} placed an order for ETB ${order.totalAmount || 0}.`,
      priority: isUrgent ? "urgent" : "normal",
    },
    [NOTIFICATION_EVENTS.ORDER_READY]: {
      title: "Order Ready",
      body: `Table ${order.tableNumber} order is ready for pickup.`,
      priority: "normal",
    },
    [NOTIFICATION_EVENTS.ORDER_ACCEPTED]: {
      title: "Order Accepted",
      body: `Table ${order.tableNumber} order has been accepted by the kitchen.`,
      priority: "normal",
    },
    [NOTIFICATION_EVENTS.ORDER_PREPARING]: {
      title: "Order Being Prepared",
      body: `Table ${order.tableNumber} order is now being prepared.`,
      priority: "normal",
    },
    [NOTIFICATION_EVENTS.ORDER_PAID]: {
      title: "Payment Confirmed",
      body: `Table ${order.tableNumber} payment of ETB ${order.totalAmount || 0} completed.`,
      priority: "normal",
    },
    [NOTIFICATION_EVENTS.ORDER_REJECTED]: {
      title: "Order Cancelled / Rejected",
      body: `Table ${order.tableNumber} order was cancelled/rejected.`,
      priority: "high",
    },
    [NOTIFICATION_EVENTS.ORDER_CANCELLED]: {
      title: "Order Cancelled",
      body: `Table ${order.tableNumber} order was cancelled.`,
      priority: "high",
    },
    [NOTIFICATION_EVENTS.ORDER_HIGH_PRIORITY]: {
      title: "🚨 High-Priority Order",
      body: `Table ${order.tableNumber} order requires urgent attention!`,
      priority: "urgent",
    },
    [NOTIFICATION_EVENTS.PAYMENT_PROOF_SUBMITTED]: {
      title: "Payment Proof Uploaded",
      body: `Table ${order.tableNumber} submitted bank transfer receipt for verification.`,
      priority: "high",
    },
    [NOTIFICATION_EVENTS.PAYMENT_REJECTED]: {
      title: "Payment Proof Declined",
      body: `Payment proof for Table ${order.tableNumber} was marked invalid.`,
      priority: "high",
    },
  }

  const msg = messages[event]
  if (!msg) return

  const dedupeKey = `${order.id}-${event}-${order.orderStatus}-${order.paymentStatus}-${order.updatedAt || order.paidAt || ""}`
  if (isDuplicateNotification(dedupeKey)) return

  const notification = createNotification({
    event,
    title: msg.title,
    body: msg.body,
    data: { orderId: order.id, tableNumber: order.tableNumber, priority: msg.priority },
    role: targetRole,
  })

  addNotification(notification)
  playNotificationSound(msg.priority)
  showBrowserNotification(msg.title, { body: msg.body, tag: notification.id, data: { orderId: order.id } })

  return notification
}
