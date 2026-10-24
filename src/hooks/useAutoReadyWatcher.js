import { useEffect, useRef } from "react"
import { observeOrders, sendPushToCustomer, updateStaffOrder } from "../services/dataService"
import { notifyOrderEvent, NOTIFICATION_EVENTS } from "../services/notificationService"

/**
 * System-wide auto-ready watcher: when an order's autoReadyAt passes while the
 * order is "preparing", the system marks it ready automatically using the
 * Estimated Preparation Time. Runs once per admin session (RoleLayout).
 */
export function useAutoReadyWatcher() {
  const ordersRef = useRef([])
  const firedRef = useRef(new Map())

  useEffect(() => {
    // Only unfinished orders can auto-ready; never load the full history here.
    return observeOrders((nextOrders) => {
      ordersRef.current = nextOrders
    }, undefined, "active")
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now()
      ordersRef.current.forEach((order) => {
        if (
          order.orderStatus !== "preparing" ||
          // Staff can disable auto-ready per order; respect the flag. Older
          // rows may not carry it at all (undefined = enabled).
          order.autoReadyEnabled === false ||
          Number(order.autoReadyAt || 0) <= 0 ||
          now < Number(order.autoReadyAt)
        ) {
          return
        }
        const target = order.autoReadyAt
        if (firedRef.current.get(order.id) === target) return
        firedRef.current.set(order.id, target)
        // autoReady lets the server accept only the first screen's update and
        // refuse it if the order already left "preparing".
        updateStaffOrder(order.id, {
          autoReady: true,
          orderStatus: "ready",
          autoReadyEnabled: false,
          autoReadyAt: 0,
          readyAt: new Date().toISOString(),
          readyAtMs: Date.now(),
        }).then(() => {
          notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_READY)
          sendPushToCustomer(order.id)
        })
          .catch((err) => {
            // Another screen already did it; don't retry or notify again.
            if (!/no longer preparing/i.test(err?.message || "")) firedRef.current.delete(order.id)
          })
      })
      if (firedRef.current.size > 200) firedRef.current.clear()
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [])
}
