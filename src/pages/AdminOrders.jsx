import { currentRegion, formatDateTime } from "../services/regionalSettings"
import { useEffect, useRef, useState } from "react"
import { Banknote, CheckCircle2, ClipboardCheck, Landmark, LayoutGrid, List, Search, TimerOff, X, XCircle } from "lucide-react"
import { StatusBadge } from "../components/StatusBadge"
import { OptimizedImage } from "../components/OptimizedImage"
import { PermissionGuard } from "../components/PermissionGuard"
import { useRBAC } from "../context/rbacContextValue"
import {
  formatCustomizations,
  formatIngredientSelections,
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

export function AdminOrders() {
  const { can } = useRBAC()
  const [orders, setOrders] = useState([])
  const [alerts, setAlerts] = useState([])
  const [clock, setClock] = useState(Date.now())
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
  const [viewLayout, setViewLayout] = useState("card")
  const previousOrders = useRef(new Map())
  const initialized = useRef(false)
  const originalTitle = useRef(document.title)

  useEffect(() => {
    document.title = unreadCount ? `(${unreadCount}) DigiMenu Admin` : originalTitle.current
    return () => { document.title = originalTitle.current }
  }, [unreadCount])

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

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
            ...(alert.lines || []).filter((line) => !line.startsWith("Time:")),
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
            sendPushToCustomer(order.id, "Your order is ready!", `Your order at Table ${order.tableNumber} is ready. Please collect it from the counter.`)
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

  const readyDelayMs = (order) => Math.max(0, Number(order.estimatedReadyMinutes || 0)) * 60 * 1000

  const changeOrderStatus = (order, orderStatus) => {
    if (order.orderStatus === "rejected" || order.orderStatus === "paid") return
    if (orderStatus === "rejected") {
      setRejectTarget(order)
      setRejectReason("")
      return
    }
    if (orderStatus === "paid" && order.orderStatus !== "ready") return
    if (!["preparing", "ready"].includes(orderStatus)) return
    updateStaffOrder(order.id, {
      orderStatus,
      autoReadyAt:
        orderStatus === "preparing"
          ? Date.now() + readyDelayMs(order)
          : orderStatus === "ready" ? null : order.autoReadyAt || null,
      preparedAt: orderStatus === "preparing" ? new Date().toISOString() : order.preparedAt || null,
      preparedAtMs: orderStatus === "preparing" ? Date.now() : order.preparedAtMs || 0,
      readyAt: orderStatus === "ready" ? new Date().toISOString() : order.readyAt || null,
      paidAt: orderStatus === "paid" ? new Date().toISOString() : order.paidAt || null,
      paymentStatus: orderStatus === "paid" ? "paid" : order.paymentStatus,
    })
    if (orderStatus === "paid") {
      writeAuditLog("order.payment.processed", { id: order.id, tableNumber: order.tableNumber, totalAmount: order.totalAmount })
    }
  }

  // Accepting an order records when staff picked it up (for tracking) and auto-starts preparing.
  const acceptOrder = (order) => {
    if (order.orderStatus !== "received") return
    const now = new Date().toISOString()
    const nowMs = Date.now()
    updateStaffOrder(order.id, {
      orderStatus: "preparing",
      autoReadyAt: nowMs + readyDelayMs(order),
      autoReadyEnabled: true,
      acceptedAt: now,
      acceptedAtMs: nowMs,
      preparedAt: now,
      preparedAtMs: nowMs,
    })
  }

  const confirmReject = () => {
    if (!rejectTarget) return
    updateStaffOrder(rejectTarget.id, {
      orderStatus: "rejected",
      autoReadyAt: null,
    })
    writeAuditLog("order.rejected", { id: rejectTarget.id, tableNumber: rejectTarget.tableNumber, reason: rejectReason })
    setRejectTarget(null)
    setRejectReason("")
  }

  const processCashPayment = (order, discountAmount = 0) => {
    const discount = Math.min(Number(discountAmount || 0), order.totalAmount)
    // total_amount is derived server-side from discountAmount — sending it
    // would be rejected by the update_staff_order field whitelist.
    updateStaffOrder(order.id, {
      paymentStatus: "paid",
      paidAt: new Date().toISOString(),
      discountAmount: discount,
      paymentMethod: "Cash",
    })
    writeAuditLog("order.payment.processed", { id: order.id, tableNumber: order.tableNumber, totalAmount: order.totalAmount - discount, discount, paymentMethod: "Cash" })
    notifyOrderEvent(order, NOTIFICATION_EVENTS.ORDER_PAID)
  }

  const selectTransferMethod = (order) => {
    if (order.orderStatus !== "ready") return
    updateStaffOrder(order.id, { paymentMethod: "transfer" })
  }

  const approveTransferProof = (order, discountAmount = 0) => {
    if (order.orderStatus !== "ready") return
    const discount = Math.min(Number(discountAmount || 0), order.totalAmount)
    updateStaffOrder(order.id, {
      orderStatus: "paid",
      paymentStatus: "paid",
      paidAt: new Date().toISOString(),
      discountAmount: discount,
    })
    writeAuditLog("order.paymentProof.approved", { id: order.id, tableNumber: order.tableNumber, totalAmount: order.totalAmount - discount, discount })
  }

  const rejectTransferProof = (order) => {
    if (order.orderStatus !== "ready") return
    updateStaffOrder(order.id, { paymentStatus: "rejected" })
    writeAuditLog("order.paymentProof.rejected", { id: order.id, tableNumber: order.tableNumber })
  }

  const toggleAutoReady = (order, enabled) => {
    if (order.orderStatus === "rejected") return
    updateStaffOrder(order.id, {
      autoReadyEnabled: enabled,
      autoReadyAt: enabled && order.orderStatus === "preparing" ? Date.now() + readyDelayMs(order) : null,
    })
  }

  const formatCountdown = (target) => {
    const totalSeconds = Math.ceil(Math.max(0, Number(target || 0) - clock) / 1000)
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
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
      (statusFilter === "all" || order.orderStatus === statusFilter) &&
      (paymentFilter === "all" || order.paymentStatus === paymentFilter)
  })

  const canProcessPayment = can(PERMISSIONS.PAYMENT_PROCESS)
  const canApplyDiscount = can(PERMISSIONS.DISCOUNT_APPLY)

  return (
    <div>
      <div className="orders-dashboard-head">
        <div>
          <p className="eyebrow">Live queue</p>
          <h2>Orders</h2>
          <p className="admin-hint">{visibleOrders.length} active orders</p>
          {unreadCount ? <p className="admin-hint">{unreadCount} unread admin alert{unreadCount === 1 ? "" : "s"}</p> : null}
          {loadError ? <p className="form-error">{loadError}</p> : null}
        </div>
        <div className="row-actions">
          {alerts.length ? (
            <button className="ghost-button" type="button" onClick={() => { setAlerts([]); setUnreadCount(0) }}>
              Clear alerts
            </button>
          ) : null}
        </div>
      </div>
      <section className="orders-toolbar">
        <label className="field search-field">
          <span>Search orders</span>
          <div className="input-with-icon">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Table, item, status, order ID" />
          </div>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="received">Received</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="field">
          <span>Payment</span>
          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            <option value="all">All payments</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <div className="view-layout-group">
          <span>View layout</span>
          <div className="view-layout-toggle">
            <button
              className={`icon-button ${viewLayout === "card" ? "active" : ""}`}
              type="button"
              onClick={() => setViewLayout("card")}
              aria-label="Card view"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              className={`icon-button ${viewLayout === "list" ? "active" : ""}`}
              type="button"
              onClick={() => setViewLayout("list")}
              aria-label="List view"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </section>
      {alerts.length ? (
        <section className="admin-alerts" aria-live="polite">
          {alerts.map((alert) => (
            <article key={alert.id}>
              <strong>{alert.title}</strong>
              <span>{alert.createdAt}</span>
              {(alert.lines || [alert.message]).map((line) => <p key={line}>{line}</p>)}
            </article>
          ))}
        </section>
      ) : null}
      <section className={`orders-grid view-${viewLayout}`}>
        {visibleOrders.length === 0 ? (
          <div className="empty-state">
            <Search size={36} strokeWidth={1.5} opacity={0.4} />
            <p style={{ margin: 0 }}>No active orders match your search or filter.</p>
            <span style={{ fontSize: "0.86rem", opacity: 0.7 }}>Try adjusting status, payment filter, or search query.</span>
          </div>
        ) : null}
        {visibleOrders.map((order) => (
          <article
            className={`order-admin-card compact-order ${order.orderStatus === "rejected" ? "rejected-order-card" : ""} ${!previousOrders.current.has(order.id) ? "new-order" : ""}`}
            key={order.id}
          >
            <div className="order-admin-top">
              <div>
                <h3>Table {order.tableNumber}</h3>
                <p>{formatDateTime(orderCreatedAt(order), { dateStyle: undefined })}</p>
              </div>
              <div className="order-top-right">
                {order.autoReadyAt && order.orderStatus === "preparing" ? (
                  <span className="countdown-pill">Remaining {formatCountdown(order.autoReadyAt)}</span>
                ) : order.estimatedReadyMinutes && order.orderStatus === "received" ? (
                  <span className="countdown-pill muted-pill">{order.estimatedReadyMinutes} min</span>
                ) : null}
                <strong>{money(order.totalAmount)}</strong>
                <StatusBadge type="payment" value={order.paymentStatus} />
              </div>
            </div>
            <div className="order-status-strip">
              <StatusBadge value={order.orderStatus} />
            </div>
            <ul>
              {(order.items || []).map((item, index) => (
                <li className="admin-order-item" key={`${order.id}-${index}`}>
                  <strong>{item.quantity} x {item.name}</strong>
                  <p>{formatIngredientSelections(item, "Ingredients", "Removed")}</p>
                  {formatCustomizations(item.customizations) ? <p>Options: {formatCustomizations(item.customizations)}</p> : null}
                  {item.notes ? <p>Note: {item.notes}</p> : null}
                  {item.calories != null ? <span className="calorie-badge">{item.calories} kcal</span> : null}
                </li>
              ))}
            </ul>
            <PermissionGuard permission={PERMISSIONS.ORDERS_UPDATE}>
              <div className={`admin-controls ${order.orderStatus === "ready" ? "payment-active" : ""}`}>
                {["received", "preparing"].includes(order.orderStatus) ? (
                  <div className="admin-action-row">
                    {order.orderStatus === "received" ? (
                      <button type="button" className="primary-button compact-btn" onClick={() => acceptOrder(order)}>
                        <ClipboardCheck size={16} /> Accept
                      </button>
                    ) : (
                      <button type="button" className="primary-button compact-btn" onClick={() => changeOrderStatus(order, "ready")}>
                        <CheckCircle2 size={16} /> Mark Ready
                      </button>
                    )}
                    {order.autoReadyAt && order.orderStatus === "preparing" ? (
                      <span className="muted auto-ready-time">Ready at {formatDateTime(order.autoReadyAt, { dateStyle: undefined })}</span>
                    ) : null}
                    {order.orderStatus === "preparing" && order.autoReadyAt ? (
                      <button
                        type="button"
                        className="ghost-button compact-btn"
                        title={order.autoReadyEnabled === false ? "Auto-ready is off for this order" : "Stop the automatic ready timer"}
                        onClick={() => toggleAutoReady(order, order.autoReadyEnabled === false)}
                      >
                        <TimerOff size={14} /> Auto-ready {order.autoReadyEnabled === false ? "off" : "on"}
                      </button>
                    ) : null}
                    <button type="button" className="danger-button reject-btn" onClick={() => changeOrderStatus(order, "rejected")}>
                      Reject
                    </button>
                  </div>
                ) : null}
                {(order.orderStatus === "ready" || isCashMethod(order.paymentMethod)) && canProcessPayment && order.paymentStatus !== "paid" ? (
                  <div className="payment-process-panel">
                    {!order.paymentMethod ? (
                      <>
                        <div className="payment-method-select">
                          <span>Select payment method</span>
                          <div className="payment-method-options">
                            <label className={`method-option ${paymentMethod[order.id] === "cash" ? "selected" : ""}`}>
                              <input
                                type="radio"
                                name={`pm-${order.id}`}
                                value="cash"
                                checked={paymentMethod[order.id] === "cash"}
                                onChange={() => setPaymentMethod((p) => ({ ...p, [order.id]: "cash" }))}
                              />
                              <Banknote size={18} />
                              <span>Cash</span>
                            </label>
                            <label className={`method-option ${paymentMethod[order.id] === "transfer" ? "selected" : ""}`}>
                              <input
                                type="radio"
                                name={`pm-${order.id}`}
                                value="transfer"
                                checked={paymentMethod[order.id] === "transfer"}
                                onChange={() => {
                                  setPaymentMethod((p) => ({ ...p, [order.id]: "transfer" }))
                                  selectTransferMethod(order)
                                }}
                              />
                              <Landmark size={18} />
                              <span>Transfer</span>
                            </label>
                          </div>
                        </div>
                        {paymentMethod[order.id] === "cash" ? (
                          <div className="cash-payment-section">
                            <p className="payment-instruction">
                              Collect <strong>{money(order.totalAmount - Number(discountInput[order.id] || 0))}</strong> from customer.
                            </p>
                            {canApplyDiscount ? (
                              <label className="field compact discount-field">
                                <span>Discount ({currentRegion().currency})</span>
                                <input
                                  type="number" min="0" step="1"
                                  value={discountInput[order.id] || ""}
                                  onChange={(e) => setDiscountInput((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                  placeholder="0"
                                />
                              </label>
                            ) : null}
                            <button
                              className="primary-button"
                              type="button"
                              onClick={() => processCashPayment(order, discountInput[order.id])}
                            >
                              Confirm Cash — Collect {money(order.totalAmount - Number(discountInput[order.id] || 0))}
                            </button>
                          </div>
                        ) : null}
                        {paymentMethod[order.id] === "transfer" ? (
                          <p className="payment-instruction">
                            Customer notified to transfer. Awaiting proof upload.
                          </p>
                        ) : null}
                      </>
                    ) : !isCashMethod(order.paymentMethod) && order.paymentStatus === "pending" && order.paymentProofUrl && isSafeStorageUrl(order.paymentProofUrl) ? (
                      <div className="transfer-proof-section">
                        <p className="eyebrow">Payment proof uploaded</p>
                        <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="proof-thumb">
                          <OptimizedImage
                            src={order.paymentProofUrl}
                            alt="Payment proof"
                            fallbackType="receipt"
                            aspectRatio="4/3"
                            style={{ maxWidth: 200, maxHeight: 120, borderRadius: 6 }}
                          />
                        </a>
                        {(() => {
                          const matched = paymentOptions.filter((o) => o.type === order.paymentMethod)
                          return matched.length ? (
                            <details className="transfer-details">
                              <summary>Show payment details</summary>
                              <ul>
                                {matched.map((opt) => (
                                  <li key={opt.id}>
                                    {opt.name ? <p><strong>{opt.name}</strong></p> : null}
                                    {opt.accountHolder ? <p>Account holder: {opt.accountHolder}</p> : null}
                                    {opt.accountNumber ? <p>Account: {opt.accountNumber}</p> : null}
                                    {opt.instructions ? <p>{opt.instructions}</p> : null}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null
                        })()}
                        <p>Verify the transfer in your banking app, then approve or reject:</p>
                        <strong>{money(order.totalAmount - Number(discountInput[order.id] || 0))}</strong>
                        {canApplyDiscount ? (
                          <label className="field compact discount-field">
                            <span>Discount ({currentRegion().currency})</span>
                            <input
                              type="number" min="0" step="1"
                              value={discountInput[order.id] || ""}
                              onChange={(e) => setDiscountInput((prev) => ({ ...prev, [order.id]: e.target.value }))}
                              placeholder="0"
                            />
                          </label>
                        ) : null}
                        <div className="proof-actions">
                          <button className="primary-button" type="button" onClick={() => approveTransferProof(order, discountInput[order.id])}>
                            <CheckCircle2 size={16} /> Approve
                          </button>
                          <button className="danger-button" type="button" onClick={() => rejectTransferProof(order)}>
                            <XCircle size={16} /> Reject
                          </button>
                        </div>
                      </div>
                    ) : !isCashMethod(order.paymentMethod) && order.paymentStatus === "unpaid" ? (
                      <p className="payment-instruction">Waiting for customer to upload transfer proof...</p>
                    ) : !isCashMethod(order.paymentMethod) && order.paymentStatus === "rejected" ? (
                      <div className="transfer-proof-section">
                        <p className="form-error">Payment proof was rejected. Ask customer to re-upload.</p>
                        <button
                          className="ghost-button" type="button"
                          onClick={() => updateStaffOrder(order.id, { paymentStatus: "unpaid" })}
                        >
                          Reset to awaiting proof
                        </button>
                      </div>
                    ) : isCashMethod(order.paymentMethod) ? (
                      <div className="cash-payment-section">
                        <p className="payment-instruction">
                          Customer chose <strong>{order.paymentMethod}</strong>
                        </p>
                        <p className="payment-instruction">
                          Collect <strong>{money(order.totalAmount - Number(discountInput[order.id] || 0))}</strong> from customer.
                        </p>
                        {canApplyDiscount ? (
                          <label className="field compact discount-field">
                            <span>Discount ({currentRegion().currency})</span>
                            <input
                              type="number" min="0" step="1"
                              value={discountInput[order.id] || ""}
                              onChange={(e) => setDiscountInput((prev) => ({ ...prev, [order.id]: e.target.value }))}
                              placeholder="0"
                            />
                          </label>
                        ) : null}
                        <button className="primary-button" type="button" onClick={() => processCashPayment(order, discountInput[order.id])}>
                          Confirm Cash — Collect {money(order.totalAmount - Number(discountInput[order.id] || 0))}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </PermissionGuard>
          </article>
        ))}
      </section>

      {rejectTarget ? (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <form className="admin-form admin-edit-modal" onSubmit={(e) => { e.preventDefault(); confirmReject() }}>
            <button className="icon-button modal-close" type="button" onClick={() => setRejectTarget(null)}>
              <X size={20} />
            </button>
            <h2>Reject Order</h2>
            <label className="field">
              <span>Reason (optional)</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Out of stock, kitchen closed..."
                rows={3}
              />
            </label>
            <div className="row-actions">
              <button className="danger-button" type="submit">Reject Order</button>
              <button className="ghost-button" type="button" onClick={() => setRejectTarget(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
