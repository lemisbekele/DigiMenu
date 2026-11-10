import { toUserMessage } from "../services/userMessages"
import { dateKey, formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, CreditCard, Search, ShieldCheck, XCircle, X, Bell } from "lucide-react"
import { StatusBadge } from "../components/StatusBadge"
import { OptimizedImage } from "../components/OptimizedImage"
import { OrderItemList } from "../components/OrderItemList"
import { Modal } from "../components/Modal"
import "./staff.css"
import { NotificationSettings } from "../components/NotificationSettings"
import {
  money,
  observeOrders,
  updateStaffOrder,
  writeAuditLog,
  isSafeStorageUrl,
} from "../services/dataService"
import {
  playNotificationSound,
  NOTIFICATION_EVENTS,
  notifyOrderEvent,
  isDuplicateNotification,
} from "../services/notificationService"
import { useKitchenQueue } from "../hooks/useKitchenQueue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { queueStatus } from "../services/kitchenQueue"

// Payment methods may be stored as the option type ("Cash") or a legacy
// display name ("Cash (Pay on hand)") — match both.
function isCashMethod(method) {
  return /cash/i.test(String(method || ""))
}

export function CashierDashboard() {
  const [orders, setOrders] = useState([])
  const queue = useKitchenQueue(orders, useCafeSlug())
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [rejectingOrder, setRejectingOrder] = useState(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const previousOrders = useRef(new Map())
  const [toasts, setToasts] = useState([])
  const initialized = useRef(false)

  const pushToast = (title, body, event, orderId, priority = "normal") => {
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const newToast = {
      id: toastId,
      title,
      body,
      event,
      orderId,
      priority,
      time: formatDateTime(new Date(), { dateStyle: undefined }),
    }
    setToasts((prev) => [newToast, ...prev].slice(0, 5))
    playNotificationSound(priority)

    if (priority !== "urgent" && priority !== "high") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId))
      }, 7000)
    }
  }

  useEffect(() => {
    return observeOrders((nextOrders) => {
      if (initialized.current) {
        nextOrders.forEach((order) => {
          const prev = previousOrders.current.get(order.id)
          const isUrgent = order.priority === "urgent" || order.priority === "high" || Number(order.totalAmount || 0) > 2000

          // 1. Payment proof submitted
          if (order.paymentStatus === "pending" && prev?.paymentStatus !== "pending") {
            const dedupeKey = `cashier-proof-${order.id}-${order.paymentProofUrl}`
            if (!isDuplicateNotification(dedupeKey)) {
              notifyOrderEvent(order, NOTIFICATION_EVENTS.PAYMENT_PROOF_SUBMITTED, "cashier")
              pushToast("Payment Proof Uploaded", `Table ${order.tableNumber} uploaded receipt for ${money(order.totalAmount)}.`, "proof", order.id, "high")
            }
          }
          // 2. New Order Received
          else if (!prev) {
            const dedupeKey = `cashier-new-${order.id}`
            if (!isDuplicateNotification(dedupeKey)) {
              notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_NEW, "cashier")
              pushToast(
                isUrgent ? "🚨 Urgent New Order" : "New Order Placed",
                `Table ${order.tableNumber} placed ${order.paymentMethod ? `a ${order.paymentMethod}` : ""} order for ${money(order.totalAmount)}.`,
                "new",
                order.id,
                isUrgent ? "urgent" : "normal"
              )
            }
          }
          // 3. Order Cancelled / Rejected
          else if (prev.orderStatus !== "rejected" && order.orderStatus === "rejected") {
            const dedupeKey = `cashier-rejected-${order.id}`
            if (!isDuplicateNotification(dedupeKey)) {
              notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_REJECTED, "cashier")
              pushToast("Order Cancelled", `Table ${order.tableNumber} order was cancelled.`, "cancelled", order.id, "high")
            }
          }
          // 4. Payment Completed
          else if (prev.paymentStatus !== "paid" && order.paymentStatus === "paid") {
            const dedupeKey = `cashier-paid-${order.id}`
            if (!isDuplicateNotification(dedupeKey)) {
              notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_PAID, "cashier")
              pushToast("Payment Confirmed", `Table ${order.tableNumber} payment of ${money(order.totalAmount)} confirmed.`, "paid", order.id, "normal")
            }
          }
          // 5. Order Marked Ready
          else if (prev.orderStatus !== "ready" && order.orderStatus === "ready") {
            const dedupeKey = `cashier-ready-${order.id}`
            if (!isDuplicateNotification(dedupeKey)) {
              notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_READY, "cashier")
              pushToast("Order Ready", `Table ${order.tableNumber} order is ready for serving.`, "ready", order.id, "normal")
            }
          }
        })
      }
      initialized.current = true
      previousOrders.current = new Map(nextOrders.map((o) => [o.id, o]))
      setOrders(nextOrders)
    })
  }, [])

  // Derived metrics
  const stats = useMemo(() => {
    let pendingProofs = 0
    let unpaidOrders = 0
    let todayPaidTotal = 0
    const today = dateKey(new Date())

    orders.forEach((o) => {
      if (o.paymentStatus === "pending") pendingProofs++
      if (o.paymentStatus === "unpaid") unpaidOrders++
      if (o.paymentStatus === "paid" || o.orderStatus === "paid") {
        const paidOn = o.paidAt ? dateKey(o.paidAt) : null
        if (paidOn === today) todayPaidTotal += Number(o.totalAmount || 0)
      }
    })

    return { pendingProofs, unpaidOrders, todayPaidTotal }
  }, [orders])

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = search.trim().toLowerCase()
      const matchSearch =
        !q ||
        String(o.tableNumber || "").toLowerCase().includes(q) ||
        String(o.id || "").toLowerCase().includes(q) ||
        String(o.paymentMethod || "").toLowerCase().includes(q)

      if (!matchSearch) return false

      if (filter === "proof_pending") return o.paymentStatus === "pending"
      if (filter === "cash") return isCashMethod(o.paymentMethod)
      return o.paymentStatus !== "paid"
    })
  }, [orders, search, filter])

  const approvePayment = async (orderId) => {
    const prevOrders = orders
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, paymentStatus: "paid", paidAt: new Date().toISOString() } : o
      )
    )
    try {
      await updateStaffOrder(orderId, {
        paymentStatus: "paid",
        paidAt: new Date().toISOString(),
      })
      await writeAuditLog("cashier.payment.approve", { orderId })
      pushToast("Payment Approved", `Payment for order #${orderId.slice(-6)} confirmed.`, "paid", orderId, "normal")
    } catch (err) {
      setOrders(prevOrders)
      pushToast("Payment not saved", toUserMessage(err, "Could not approve payment."), "error", orderId, "high")
    }
  }

  const handleRejectSubmit = async (e) => {
    e.preventDefault()
    if (!rejectingOrder) return
    const orderId = rejectingOrder.id
    const prevOrders = orders
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              paymentStatus: "rejected",
              rejectionReason: rejectionReason.trim() || "Payment proof could not be verified by cashier.",
            }
          : o
      )
    )
    setRejectingOrder(null)
    setRejectionReason("")
    try {
      await updateStaffOrder(orderId, {
        paymentStatus: "rejected",
        rejectionReason: rejectionReason.trim() || "Payment proof could not be verified by cashier.",
      })
      await writeAuditLog("cashier.payment.reject", { orderId, reason: rejectionReason })
    } catch (err) {
      setOrders(prevOrders)
      pushToast("Rejection not saved", toUserMessage(err, "Could not reject payment proof."), "error", orderId, "high")
    }
  }

  const openCount = orders.filter((o) => o.paymentStatus !== "paid").length
  const chips = [
    { key: "all", label: "To do", count: openCount },
    { key: "proof_pending", label: "Receipts to check", count: stats.pendingProofs },
    { key: "cash", label: "Cash" },
  ]

  return (
    <div className="oc-page cashier-dashboard">
      <header className="oc-head">
        <div>
          <h1>Payments</h1>
          <p>Check transfer receipts and take cash payments.</p>
        </div>
        <NotificationSettings role="cashier" buttonLabel="Turn on alerts" compact />
      </header>

      <section className="oc-stats" aria-label="Today">
        <div className="oc-stat"><span>Receipts to check</span><strong>{stats.pendingProofs}</strong></div>
        <div className="oc-stat"><span>Unpaid orders</span><strong>{stats.unpaidOrders}</strong></div>
        <div className="oc-stat"><span>Collected today</span><strong>{money(stats.todayPaidTotal)}</strong></div>
      </section>

      <section className="oc-toolbar">
        <label className="oc-search">
          <Search size={18} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Table, order ID or payment method" aria-label="Search payments" />
        </label>
        <div className="oc-chips" role="group" aria-label="Show">
          {chips.map((chip) => (
            <button key={chip.key} type="button" className="oc-chip" aria-pressed={filter === chip.key} onClick={() => setFilter(chip.key)}>
              {chip.label}{chip.count != null ? <span className="oc-chip-count">{chip.count}</span> : null}
            </button>
          ))}
        </div>
      </section>

      {filteredOrders.length === 0 ? (
        <div className="oc-empty">
          <ShieldCheck size={32} strokeWidth={1.5} />
          <strong>All caught up</strong>
          <p>No payments waiting here. New ones appear automatically.</p>
        </div>
      ) : (
        <section className="oc-grid">
          {filteredOrders.map((order) => {
            const hasProof = Boolean(order.paymentProofUrl)
            const safeProof = hasProof && isSafeStorageUrl(order.paymentProofUrl)
            return (
              <article key={order.id} className="oc-card">
                <div className="oc-card-top">
                  <div>
                    <h3 className="oc-table">Table {order.tableNumber}</h3>
                    <p className="oc-meta">#{order.id?.slice(-6)} · {order.paymentMethod || "No method yet"}</p>
                  </div>
                  <span className="oc-total">{money(order.totalAmount)}</span>
                </div>
                <div className="oc-status">
                  <StatusBadge type="payment" value={order.paymentStatus} label={order.paymentStatus} />
                  <span>{queueStatus(order, queue)}</span>
                  {queue.has(order.id) ? <span>· about {queue.get(order.id).waitMinutes} min</span> : null}
                </div>
                <OrderItemList items={order.items} />
                {safeProof ? (
                  <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="oc-proof" aria-label="Open the receipt">
                    <OptimizedImage src={order.paymentProofUrl} alt="Payment receipt" fallbackType="receipt" aspectRatio="4/3" />
                  </a>
                ) : hasProof ? (
                  <p className="oc-proof-missing">This receipt link can't be opened safely. Ask the customer to upload it again.</p>
                ) : null}
                {order.paymentStatus !== "paid" ? (
                  <div className="oc-actions">
                    <button className="oc-main" type="button" onClick={() => approvePayment(order.id)}>
                      <CheckCircle2 size={18} /> {order.paymentStatus === "pending" ? "Approve payment" : "Mark as paid"}
                    </button>
                    {order.paymentStatus === "pending" ? (
                      <button className="oc-quiet oc-danger" type="button" onClick={() => setRejectingOrder(order)}>
                        <XCircle size={16} /> Reject
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })}
        </section>
      )}

      {rejectingOrder ? (
        <Modal title="Reject this receipt?" className="confirm-dialog" onClose={() => setRejectingOrder(null)}>
          <form className="oc-dialog-form" onSubmit={handleRejectSubmit}>
            <p className="oc-meta">Table {rejectingOrder.tableNumber} · #{rejectingOrder.id?.slice(-6)} · {money(rejectingOrder.totalAmount)}</p>
            <label>
              Reason the customer will see
              <textarea rows="3" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Transfer not found, or the photo is unreadable." required />
            </label>
            <div className="row-actions">
              <button className="danger-button" type="submit">Reject receipt</button>
              <button className="ghost-button" type="button" onClick={() => setRejectingOrder(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      ) : null}

      <section className="pos-toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pos-toast ${t.priority === "urgent" || t.priority === "high" ? "urgent" : ""}`}
            onClick={() => { if (t.orderId) setSearch(t.orderId.slice(-6)) }}
          >
            <div className="pos-toast-icon">
              {t.event === "proof" ? <CreditCard size={20} /> : t.event === "cancelled" ? <XCircle size={20} /> : <Bell size={20} />}
            </div>
            <div className="pos-toast-content">
              <div className="pos-toast-head">
                <strong>{t.title}</strong>
                {t.priority === "urgent" ? <span className="urgent-badge">URGENT</span> : null}
              </div>
              <p>{t.body}</p>
              <span className="pos-toast-time">{t.time}</span>
            </div>
            <button
              className="icon-button small modal-close"
              type="button"
              aria-label="Dismiss"
              onClick={(e) => { e.stopPropagation(); setToasts((current) => current.filter((x) => x.id !== t.id)) }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </section>
    </div>
  )
}
