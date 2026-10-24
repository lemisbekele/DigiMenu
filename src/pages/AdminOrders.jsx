import { currentRegion, formatDateTime } from "../services/regionalSettings"
import { useEffect, useRef, useState } from "react"
import { Banknote, CheckCircle2, Landmark, Search, XCircle } from "lucide-react"
import { StatusBadge } from "../components/StatusBadge"
import { useKitchenQueue } from "../hooks/useKitchenQueue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { queueStatus } from "../services/kitchenQueue"
import { OptimizedImage } from "../components/OptimizedImage"
import { OrderItemList } from "../components/OrderItemList"
import { Modal } from "../components/Modal"
import "./orders.css"
import { PermissionGuard } from "../components/PermissionGuard"
import { useRBAC } from "../context/rbacContextValue"
import {
  money,
  observeOrders,
  observePaymentOptions,
  sendPushToCustomer,
  updateStaffOrder,
  writeAuditLog,
  isSafeStorageUrl,
} from "../services/dataService"
import { PERMISSIONS } from "../services/roleService"
import { notifyOrderEvent, NOTIFICATION_EVENTS, showBrowserNotification } from "../services/notificationService"

function orderCreatedAt(order) {
  if (order.createdAt?.toDate) return order.createdAt.toDate()
  if (order.createdAtMs) return new Date(order.createdAtMs)
  return new Date(order.createdAt || Date.now())
}

function normalizeSearch(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

// Payment methods are stored as the semantic option type ("Cash", "Bank",
// "Telebirr", ...) or a legacy display name. Cash detection must cover both.
function isCashMethod(method) {
  return /cash/i.test(String(method || ""))
}

const STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "inLine", label: "In line" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
]
const PAYMENT_CHIPS = [
  { key: "all", label: "Any payment" },
  { key: "unpaid", label: "Unpaid" },
  { key: "pending", label: "Receipt to check" },
  { key: "paid", label: "Paid" },
]

export function AdminOrders() {
  const { can } = useRBAC()
  const [orders, setOrders] = useState([])
  const queue = useKitchenQueue(orders, useCafeSlug())
  const [alerts, setAlerts] = useState([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadError, setLoadError] = useState("")
  const [discountInput, setDiscountInput] = useState({})
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState("")
  const [paymentMethod, setPaymentMethod] = useState({})
  const [paymentOptions, setPaymentOptions] = useState([])
  const previousOrders = useRef(new Map())
  const initialized = useRef(false)
  const originalTitle = useRef(document.title)

  useEffect(() => {
    document.title = unreadCount ? `(${unreadCount}) DigiMenu Admin` : originalTitle.current
    return () => { document.title = originalTitle.current }
  }, [unreadCount])

  useEffect(() => {
    return observePaymentOptions((opts) => setPaymentOptions(opts.filter((o) => o.active)))
  }, [])

  const notifyAdmin = ({ id, lines, order, title = "Notification" }) => {
    const createdAt = formatDateTime(new Date(), { dateStyle: undefined })
    const nextLines = [...lines, `Time: ${createdAt}.`]
    const message = nextLines.join("\n")
    setAlerts((current) => {
      const existing = current.find((alert) => alert.id === id)
      if (existing) {
        const mergedLines = [
          ...new Set([
            ...(existing.lines || []).filter((line) => !line.startsWith("Time:")),
            ...nextLines.filter((line) => !line.startsWith("Time:")),
          ]),
          `Time: ${createdAt}.`,
        ]
        return current.map((alert) =>
          alert.id === id ? { ...alert, createdAt, lines: mergedLines, message: mergedLines.join("\n") } : alert,
        )
      }
      return [{ id, title, lines: nextLines, message, createdAt }, ...current].slice(0, 6)
    })
    setTimeout(() => {
      setAlerts((current) => current.filter((a) => a.id !== id))
    }, 5000)
    setUnreadCount((current) => current + 1)
    if ("Notification" in window && Notification.permission === "granted") {
      showBrowserNotification(title, { body: message, tag: id, data: { orderId: order?.id } })
    }
  }

  useEffect(() => {
    return observeOrders((nextOrders) => {
      if (initialized.current) {
        nextOrders.forEach((order) => {
          const prev = previousOrders.current.get(order.id)
          if (!prev) {
            notifyAdmin({
              id: `${order.id}-activity`,
              lines: [`Table ${order.tableNumber} placed an order for ${money(order.totalAmount)}.`],
              order,
              title: "New Order Received",
            })
            notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_NEW)
          } else if (prev.orderStatus !== "ready" && order.orderStatus === "ready") {
            notifyAdmin({
              id: `${order.id}-activity`,
              lines: [`Table ${order.tableNumber} order is ready.`],
              order,
              title: "Order Ready",
            })
            notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_READY)
          } else if (prev.orderStatus !== "paid" && order.orderStatus === "paid") {
            notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_PAID)
          } else if (prev.orderStatus !== "rejected" && order.orderStatus === "rejected") {
            notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_REJECTED)
          }
        })
      }
      previousOrders.current = new Map(nextOrders.map((order) => [order.id, order]))
      initialized.current = true
      setOrders(nextOrders)
    }, setLoadError)
  }, [])

  const changeOrderStatus = (order, orderStatus) => {
    if (order.orderStatus === "rejected" || order.orderStatus === "paid") return
    if (orderStatus === "rejected") {
      setRejectTarget(order)
      setRejectReason("")
      return
    }
    if (orderStatus !== "ready") return
    save(order.id, { orderStatus, readyAt: new Date().toISOString(), readyAtMs: Date.now() }, () => sendPushToCustomer(order.id))
  }

  // Every action waits for the save; the audit entry and notification follow only a successful save,
  // and a failure shows in the page's error line instead of disappearing.
  const save = (orderId, changes, after) => {
    setLoadError("")
    return updateStaffOrder(orderId, changes).then(after).catch((err) => setLoadError(err.message || "Could not save the change. Please retry."))
  }

  const confirmReject = () => {
    if (!rejectTarget) return
    const target = rejectTarget
    setRejectTarget(null)
    setRejectReason("")
    save(target.id, { orderStatus: "rejected" }, () =>
      writeAuditLog("order.rejected", { id: target.id, tableNumber: target.tableNumber, reason: rejectReason }))
  }

  const processCashPayment = (order, discountAmount = 0) => {
    const discount = Math.min(Number(discountAmount || 0), order.totalAmount)
    // total_amount is derived server-side from discountAmount — sending it
    // would be rejected by the update_staff_order field whitelist.
    save(order.id, {
      paymentStatus: "paid",
      paidAt: new Date().toISOString(),
      discountAmount: discount,
      paymentMethod: "Cash",
    }, () => {
      writeAuditLog("order.payment.processed", { id: order.id, tableNumber: order.tableNumber, totalAmount: order.totalAmount - discount, discount, paymentMethod: "Cash" })
      notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_PAID)
    })
  }

  const selectTransferMethod = (order) => {
    if (order.orderStatus !== "ready") return
    save(order.id, { paymentMethod: "transfer" })
  }

  const approveTransferProof = (order, discountAmount = 0) => {
    if (order.orderStatus !== "ready") return
    const discount = Math.min(Number(discountAmount || 0), order.totalAmount)
    save(order.id, {
      orderStatus: "paid",
      paymentStatus: "paid",
      paidAt: new Date().toISOString(),
      discountAmount: discount,
    }, () => writeAuditLog("order.paymentProof.approved", { id: order.id, tableNumber: order.tableNumber, totalAmount: order.totalAmount - discount, discount }))
  }

  const rejectTransferProof = (order) => {
    if (order.orderStatus !== "ready") return
    save(order.id, { paymentStatus: "rejected" }, () =>
      writeAuditLog("order.paymentProof.rejected", { id: order.id, tableNumber: order.tableNumber }))
  }

  const visibleOrders = orders.filter((order) => {
    const baseMatch = order.orderStatus !== "paid" && order.orderStatus !== "rejected"
    const orderFields = [
      order.id, order.tableNumber, `table ${order.tableNumber}`,
      order.customerName, order.customer?.name,
      order.orderStatus, order.paymentStatus,
      money(order.totalAmount), formatDateTime(orderCreatedAt(order), { dateStyle: undefined }),
      ...(order.items || []).flatMap((item) => [item.name, item.category, item.subcategory]),
    ]
    const searchMatch = !normalizeSearch(search) || normalizeSearch(orderFields.join(" ")).includes(normalizeSearch(search))
    return baseMatch && searchMatch &&
      (statusFilter === "all" || (statusFilter === "inLine" ? queue.has(order.id) && !queue.get(order.id).preparing : statusFilter === "preparing" ? Boolean(queue.get(order.id)?.preparing) : order.orderStatus === statusFilter)) &&
      (paymentFilter === "all" || order.paymentStatus === paymentFilter)
  })

  const canProcessPayment = can(PERMISSIONS.PAYMENT_PROCESS)
  const canApplyDiscount = can(PERMISSIONS.DISCOUNT_APPLY)

  // One cash step, used whether the cashier picked cash or the customer did.
  const cashStep = (order, note) => {
    const due = order.totalAmount - Number(discountInput[order.id] || 0)
    return (
      <>
        {note ? <p>{note}</p> : null}
        {canApplyDiscount ? (
          <label className="oc-discount">
            Discount ({currentRegion().currency})
            <input
              type="number" min="0" step="1" inputMode="numeric"
              value={discountInput[order.id] || ""}
              onChange={(e) => setDiscountInput((prev) => ({ ...prev, [order.id]: e.target.value }))}
              placeholder="0"
            />
          </label>
        ) : null}
        <button className="oc-main" type="button" onClick={() => processCashPayment(order, discountInput[order.id])}>
          <Banknote size={18} /> Collect {money(due)}
        </button>
      </>
    )
  }

  const paymentStep = (order) => {
    if (!order.paymentMethod) {
      return (
        <>
          <div className="oc-methods" role="group" aria-label="Payment method">
            <button type="button" className="oc-method" aria-pressed={paymentMethod[order.id] === "cash"}
              onClick={() => setPaymentMethod((p) => ({ ...p, [order.id]: "cash" }))}>
              <Banknote size={18} /> Cash
            </button>
            <button type="button" className="oc-method" aria-pressed={paymentMethod[order.id] === "transfer"}
              onClick={() => { setPaymentMethod((p) => ({ ...p, [order.id]: "transfer" })); selectTransferMethod(order) }}>
              <Landmark size={18} /> Transfer
            </button>
          </div>
          {paymentMethod[order.id] === "cash" ? cashStep(order) : null}
          {paymentMethod[order.id] === "transfer" ? <p>Waiting for the customer to upload their transfer receipt.</p> : null}
        </>
      )
    }
    if (isCashMethod(order.paymentMethod)) return cashStep(order, `Customer will pay with ${order.paymentMethod}.`)
    if (order.paymentStatus === "pending" && order.paymentProofUrl && isSafeStorageUrl(order.paymentProofUrl)) {
      const details = paymentOptions.filter((o) => o.type === order.paymentMethod)
      return (
        <>
          <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="oc-proof" aria-label="Open the receipt">
            <OptimizedImage src={order.paymentProofUrl} alt="Payment receipt" fallbackType="receipt" aspectRatio="4/3" />
          </a>
          {details.length ? (
            <details className="transfer-details">
              <summary>Account details</summary>
              <ul>
                {details.map((opt) => (
                  <li key={opt.id}>
                    {opt.name ? <p><strong>{opt.name}</strong></p> : null}
                    {opt.accountHolder ? <p>Account holder: {opt.accountHolder}</p> : null}
                    {opt.accountNumber ? <p>Account: {opt.accountNumber}</p> : null}
                    {opt.instructions ? <p>{opt.instructions}</p> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p>Check {money(order.totalAmount - Number(discountInput[order.id] || 0))} arrived in your bank app, then approve.</p>
          {canApplyDiscount ? (
            <label className="oc-discount">
              Discount ({currentRegion().currency})
              <input type="number" min="0" step="1" inputMode="numeric" value={discountInput[order.id] || ""} placeholder="0"
                onChange={(e) => setDiscountInput((prev) => ({ ...prev, [order.id]: e.target.value }))} />
            </label>
          ) : null}
          <div className="oc-actions">
            <button className="oc-main" type="button" onClick={() => approveTransferProof(order, discountInput[order.id])}>
              <CheckCircle2 size={18} /> Approve payment
            </button>
            <button className="oc-quiet oc-danger" type="button" onClick={() => rejectTransferProof(order)}>
              <XCircle size={16} /> Reject
            </button>
          </div>
        </>
      )
    }
    if (order.paymentStatus === "rejected") {
      return (
        <>
          <p className="oc-proof-missing">The receipt was rejected. Ask the customer to upload a new one.</p>
          <button className="oc-quiet" type="button" onClick={() => save(order.id, { paymentStatus: "unpaid" })}>Wait for a new receipt</button>
        </>
      )
    }
    return <p>Waiting for the customer to upload their transfer receipt.</p>
  }

  return (
    <div className="oc-page">
      <header className="oc-head">
        <div>
          <h1>Orders</h1>
          <p>{visibleOrders.length} open{unreadCount ? ` · ${unreadCount} new alert${unreadCount === 1 ? "" : "s"}` : ""}</p>
        </div>
        {alerts.length ? (
          <button className="oc-quiet" type="button" onClick={() => { setAlerts([]); setUnreadCount(0) }}>Clear alerts</button>
        ) : null}
      </header>
      {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}

      <section className="oc-toolbar">
        <label className="oc-search">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Table, item, status, order ID" aria-label="Search orders" />
        </label>
        <div className="oc-chips" role="group" aria-label="Status">
          {STATUS_CHIPS.map((chip) => (
            <button key={chip.key} type="button" className="oc-chip" aria-pressed={statusFilter === chip.key} onClick={() => setStatusFilter(chip.key)}>
              {chip.label}
            </button>
          ))}
        </div>
        <div className="oc-chips" role="group" aria-label="Payment">
          {PAYMENT_CHIPS.map((chip) => (
            <button key={chip.key} type="button" className="oc-chip" aria-pressed={paymentFilter === chip.key} onClick={() => setPaymentFilter(chip.key)}>
              {chip.label}
            </button>
          ))}
        </div>
      </section>

      {alerts.length ? (
        <section className="oc-alerts" aria-live="polite">
          {alerts.map((alert) => (
            <article key={alert.id} className="oc-alert">
              <strong>{alert.title}</strong>
              {(alert.lines || [alert.message]).filter((line) => !line.startsWith("Time:")).map((line) => <p key={line}>{line}</p>)}
            </article>
          ))}
        </section>
      ) : null}

      {visibleOrders.length === 0 ? (
        <div className="oc-empty">
          <Search size={32} strokeWidth={1.5} />
          <strong>No open orders here</strong>
          <p>New orders appear automatically. Try another filter or clear the search.</p>
        </div>
      ) : (
        <section className="oc-grid">
          {visibleOrders.map((order) => {
            const q = queue.get(order.id)
            const showPayment = (order.orderStatus === "ready" || isCashMethod(order.paymentMethod)) && canProcessPayment && order.paymentStatus !== "paid"
            return (
              <article className="oc-card" key={order.id}>
                <div className="oc-card-top">
                  <div>
                    <h3 className="oc-table">Table {order.tableNumber}</h3>
                    <p className="oc-meta">{formatDateTime(orderCreatedAt(order), { dateStyle: undefined })} · #{String(order.id).slice(-6)}</p>
                  </div>
                  <span className="oc-total">{money(order.totalAmount)}</span>
                </div>
                <div className="oc-status">
                  <StatusBadge value={q?.preparing ? "preparing" : order.orderStatus} label={queueStatus(order, queue)} />
                  <StatusBadge type="payment" value={order.paymentStatus} />
                  {q ? <span>about {q.waitMinutes} min</span> : null}
                </div>
                <OrderItemList items={order.items} />
                <PermissionGuard permission={PERMISSIONS.ORDERS_UPDATE}>
                  {["received", "accepted", "preparing"].includes(order.orderStatus) ? (
                    <div className="oc-actions">
                      <button type="button" className="oc-main" onClick={() => changeOrderStatus(order, "ready")}>
                        <CheckCircle2 size={18} /> Done
                      </button>
                      <button type="button" className="oc-quiet oc-danger" onClick={() => changeOrderStatus(order, "rejected")}>
                        Reject
                      </button>
                    </div>
                  ) : null}
                  {showPayment ? (
                    <section className="oc-pay" aria-label="Payment">
                      <p className="oc-pay-title">Payment</p>
                      {paymentStep(order)}
                    </section>
                  ) : null}
                </PermissionGuard>
              </article>
            )
          })}
        </section>
      )}

      {rejectTarget ? (
        <Modal title={`Reject Table ${rejectTarget.tableNumber}'s order?`} className="confirm-dialog" onClose={() => setRejectTarget(null)}>
          <form className="oc-dialog-form" onSubmit={(e) => { e.preventDefault(); confirmReject() }}>
            <label>
              Reason (optional)
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Out of stock, kitchen closed" rows={3} />
            </label>
            <div className="row-actions">
              <button className="danger-button" type="submit">Reject Order</button>
              <button className="ghost-button" type="button" onClick={() => setRejectTarget(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
