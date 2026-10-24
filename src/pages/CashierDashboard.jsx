import { toUserMessage } from "../services/userMessages"
import { dateKey, formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useRef, useState } from "react"
import { Banknote, CheckCircle2, Clock, CreditCard, DollarSign, Eye, Search, ShieldCheck, XCircle, X, Bell } from "lucide-react"
import { StatusBadge } from "../components/StatusBadge"
import { CalorieBadge } from "../components/CalorieBadge"
import { NotificationSettings } from "../components/NotificationSettings"
import {
  money,
  observeOrders,
  totalCalories,
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
      alert(toUserMessage(err, "Could not approve payment."))
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
      alert(toUserMessage(err, "Could not reject payment proof."))
    }
  }

  return (
    <div className="admin-stack cashier-dashboard">
      <div className="admin-head">
        <div>
          <p className="eyebrow">Cashier POS & Payment Terminal</p>
          <h2 style={{ margin: "2px 0 0" }}>Cashier Dashboard</h2>
          <p className="admin-hint">Verify bank payment proofs, process cash transactions, and track order settlements.</p>
        </div>
        <div className="row-actions">
          <NotificationSettings role="cashier" buttonLabel="Enable Cashier Notifications" />
        </div>
      </div>

      {/* Overview Cards */}
      <section className="stats-grid">
        <article className="stat-card">
          <div className="stat-head">
            <span>Pending Payment Proofs</span>
            <Clock size={20} style={{ color: "#d97706" }} />
          </div>
          <p className="stat-value">{stats.pendingProofs}</p>
          <p className="stat-note">Requires verification</p>
        </article>

        <article className="stat-card">
          <div className="stat-head">
            <span>Unpaid Orders</span>
            <Banknote size={20} style={{ color: "#c93b2b" }} />
          </div>
          <p className="stat-value">{stats.unpaidOrders}</p>
          <p className="stat-note">Awaiting payment settlement</p>
        </article>

        <article className="stat-card">
          <div className="stat-head">
            <span>Today's Total Settled</span>
            <DollarSign size={20} style={{ color: "var(--brand)" }} />
          </div>
          <p className="stat-value">{money(stats.todayPaidTotal)}</p>
          <p className="stat-note">Successfully collected</p>
        </article>
      </section>

      {/* Filter Tabs & Search Toolbar */}
      <section className="orders-toolbar">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
          <button
            type="button"
            className={filter === "all" ? "primary-button" : "ghost-button"}
            onClick={() => setFilter("all")}
          >
            All Pending ({orders.filter((o) => o.paymentStatus !== "paid").length})
          </button>
          <button
            type="button"
            className={filter === "proof_pending" ? "primary-button" : "ghost-button"}
            onClick={() => setFilter("proof_pending")}
          >
            Pending Proofs ({stats.pendingProofs})
          </button>
          <button
            type="button"
            className={filter === "cash" ? "primary-button" : "ghost-button"}
            onClick={() => setFilter("cash")}
          >
            Cash Orders
          </button>
        </div>

        <label className="field search-field" style={{ margin: 0 }}>
          <div className="input-with-icon">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table, item, or order ID..."
            />
          </div>
        </label>
      </section>

      {/* Orders List / Cards */}
      {filteredOrders.length === 0 ? (
        <div className="empty-state">
          <ShieldCheck size={36} strokeWidth={1.5} style={{ opacity: 0.3 }} />
          <p style={{ margin: 0 }}>No payment verification tasks in this queue.</p>
          <span style={{ fontSize: "0.86rem", opacity: 0.7 }}>All active orders and payment proofs are settled.</span>
        </div>
      ) : (
        <div className="orders-grid">
          {filteredOrders.map((order) => (
            <article key={order.id} className="summary-panel order-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <p className="eyebrow" style={{ margin: 0 }}>Table {order.tableNumber}</p>
                  <h3 style={{ margin: "2px 0 0" }}>Order #{order.id?.slice(-6)}</h3>
                </div>
                <StatusBadge type="payment" value={order.paymentStatus} label={order.paymentStatus} />
              </div>

              <div className="order-card-body" style={{ marginBottom: 12 }}>
                <p style={{ margin: "4px 0", fontSize: "0.9rem" }}>
                  <strong>Total: {money(order.totalAmount)}</strong>
                </p>
                {(order.items || []).length > 0 ? (
                  <ul className="cashier-items" style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
                    {order.items.map((item, i) => (
                      <li
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "5px 0",
                          fontSize: "0.85rem",
                          borderTop: "1px solid var(--border-color)",
                        }}
                      >
                        <span style={{ fontWeight: 700, flexShrink: 0 }}>{item.quantity} x</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </span>
                        <CalorieBadge calories={item.calories} size="sm" />
                      </li>
                    ))}
                    <li
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "5px 0",
                        fontSize: "0.8rem",
                        opacity: 0.85,
                        borderTop: "1px solid var(--border-color)",
                      }}
                    >
                      <span>Total calories</span>
                      <strong>{totalCalories(order.items)} kcal</strong>
                    </li>
                  </ul>
                ) : null}
                <p style={{ margin: "4px 0", fontSize: "0.85rem", opacity: 0.8 }}>
                  Method: {order.paymentMethod || "Not selected"}
                </p>
                <p style={{ margin: "4px 0", fontSize: "0.85rem", opacity: 0.8 }}>
                  Status: <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{queueStatus(order, queue)}</span>
                  {queue.has(order.id) ? <span className="countdown-pill" style={{ marginLeft: 8 }}>~{queue.get(order.id).waitMinutes} min</span> : null}
                </p>
              </div>

              {/* Uploaded Proof Preview */}
              {order.paymentProofUrl && isSafeStorageUrl(order.paymentProofUrl) ? (
                <div style={{ background: "var(--bg-muted)", padding: 8, borderRadius: 8, marginBottom: 12, textAlign: "center" }}>
                  <p style={{ fontSize: "0.8rem", margin: "0 0 6px", fontWeight: 600 }}>Uploaded Payment Proof:</p>
                  <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.85rem" }}>
                    <Eye size={14} /> View Receipt Image
                  </a>
                </div>
              ) : order.paymentProofUrl ? (
                <div style={{ background: "var(--bg-muted)", padding: 8, borderRadius: 8, marginBottom: 12, textAlign: "center" }}>
                  <p style={{ fontSize: "0.8rem", margin: "0 0 6px", fontWeight: 600 }}>Uploaded Payment Proof:</p>
                  <p className="form-error" style={{ margin: 0 }}>Invalid proof URL</p>
                </div>
              ) : null}

              {/* Cashier Actions */}
              <div className="row-actions" style={{ gap: 8 }}>
                {order.paymentStatus !== "paid" ? (
                  <button
                    className="primary-button small"
                    type="button"
                    onClick={() => approvePayment(order.id)}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    <CheckCircle2 size={16} /> Approve Payment
                  </button>
                ) : null}

                {order.paymentStatus === "pending" ? (
                  <button
                    className="ghost-button small danger"
                    type="button"
                    onClick={() => setRejectingOrder(order)}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    <XCircle size={16} /> Reject Proof
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingOrder ? (
        <div className="modal-backdrop" onClick={() => setRejectingOrder(null)}>
          <form className="modal-card" onSubmit={handleRejectSubmit} onClick={(e) => e.stopPropagation()}>
            <h3>Reject Payment Proof</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: 12 }}>
              Table {rejectingOrder.tableNumber} &middot; Order #{rejectingOrder.id?.slice(-6)} ({money(rejectingOrder.totalAmount)})
            </p>
            <label className="field">
              <span>Rejection Reason</span>
              <textarea
                rows="3"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Transaction reference not found or unreadable image."
                required
              />
            </label>
            <div className="edit-modal-actions" style={{ marginTop: 16 }}>
              <button className="ghost-button" type="button" onClick={() => setRejectingOrder(null)}>
                Cancel
              </button>
              <button className="primary-button danger" type="submit">
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Real-time Cashier POS Toast Banners */}
      <section className="pos-toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pos-toast ${t.priority === "urgent" || t.priority === "high" ? "urgent" : ""}`}
            onClick={() => {
              if (t.orderId) setSearch(t.orderId.slice(-6))
            }}
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
              onClick={(e) => {
                e.stopPropagation()
                setToasts((current) => current.filter((x) => x.id !== t.id))
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </section>
    </div>
  )
}
