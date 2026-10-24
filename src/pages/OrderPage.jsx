import { toUserMessage } from "../services/userMessages"
import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, ClipboardCheck, Clock, Coffee, CookingPot, Copy, Flame, Info, Receipt, RotateCcw, TimerOff, XCircle } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { NotificationSettings } from "../components/NotificationSettings"
import { StatusBadge } from "../components/StatusBadge"
import { useLanguage } from "../context/languageContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"

import { DEFAULT_BILLING_SETTINGS } from "../services/billingSettings"
import { ImageUploader } from "../components/ImageUploader"
import { showBrowserNotification } from "../services/notificationService"
import { isOrderReady } from "../services/kitchenAlerts"
import { formatCustomizations, formatIngredientSelections, money, observeBillingSettings, observeOrder, observePaymentOptions, updateCustomerOrder, uploadPaymentProof, caloriesLabel, cartLineCalories, isSafeStorageUrl } from "../services/dataService"
import { OptimizedImage } from "../components/OptimizedImage"
import { usePaymentConfirmedPopup } from "../hooks/usePaymentConfirmedPopup"

function formatCountdown(targetMs, now) {
  const remaining = Math.max(0, Number(targetMs || 0) - now)
  const totalSeconds = Math.ceil(remaining / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatTime(date) {
  if (!date) return ""
  return formatDateTime(date, { dateStyle: undefined })
}

function orderTimestamp(order, status) {
  const raw =
    status === "accepted"
      ? order.acceptedAtMs ?? order.acceptedAt ?? null
      : status === "preparing"
      ? order.preparedAtMs ?? order.preparedAt ?? null
      : status === "ready"
      ? order.readyAtMs ?? order.readyAt ?? null
      : status === "received"
      ? order.createdAtMs ?? order.createdAt ?? null
      : null
  if (!raw) return null
  const date = typeof raw === "number" ? new Date(raw) : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

const stepMeta = {
  received: { icon: Receipt, labelKey: "received", timeKey: "placedAt", color: "#6b7280" },
  accepted: { icon: ClipboardCheck, labelKey: "accepted", timeKey: "acceptedTime", color: "#2563eb" },
  preparing: { icon: CookingPot, labelKey: "preparing", timeKey: "preparingTime", color: "#d97706" },
  ready: { icon: Coffee, labelKey: "ready", timeKey: "readyTime", color: "var(--brand)" },
}

function isCashPayment(method) {
  if (!method) return false
  const m = String(method).toLowerCase()
  return m === "cash" || m.includes("cash") || m.includes("hand") || m.includes("counter")
}

export function OrderPage() {
  const { orderId } = useParams()
  const cafeSlug = useCafeSlug()
  const { t } = useLanguage()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [billingSettings, setBillingSettings] = useState(DEFAULT_BILLING_SETTINGS)
  const [paymentOptions, setPaymentOptions] = useState([])
  const [selectedMethod, setSelectedMethod] = useState("")
  const [proofError, setProofError] = useState("")
  const [copiedAccount, setCopiedAccount] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const previousStatus = useRef(null)
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => {
    return observeOrder(orderId, (nextOrder) => {
      if (isOrderReady(nextOrder) && previousStatus.current && !isOrderReady(previousStatus.current)) {
        if ("Notification" in window && Notification.permission === "granted") {
          showBrowserNotification(tRef.current("orderReadyTitle"), { body: tRef.current("orderReadyBody") })
        }
      }
      previousStatus.current = nextOrder || null
      setOrder(nextOrder)
      setLoading(false)
    }, (message) => {
      setLoadError(message)
      setLoading(false)
    })
  }, [orderId])

  useEffect(() => { return observeBillingSettings(setBillingSettings) }, [])
  useEffect(() => {
    return observePaymentOptions((opts) => {
      const active = opts.filter((o) => o.active)
      const cashDefault = { id: "on-hand", type: "Cash", name: "Cash (Pay on hand)" }
      const hasCash = active.some((o) => o.type === "Cash")
      setPaymentOptions(hasCash ? active : [cashDefault, ...active])
    })
  }, [])
  useEffect(() => {
    if (order?.paymentMethod) setSelectedMethod(order.paymentMethod)
  }, [order?.paymentMethod])
  const { popup: paymentConfirmedPopup } = usePaymentConfirmedPopup(order)
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  if (loading) {
    return (
      <main className="page-pad narrow" style={{ textAlign: "center", paddingTop: 80 }}>
        <Clock size={40} strokeWidth={1.5} opacity={0.4} />
        <p style={{ marginTop: 16 }}>{t("loadingOrder")}</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="page-pad narrow" style={{ textAlign: "center", paddingTop: 80 }}>
        <TimerOff size={40} strokeWidth={1.5} opacity={0.4} />
        <p className="form-error" style={{ marginTop: 16 }}>{loadError}</p>
      </main>
    )
  }

  if (!order) {
    return (
      <main className="page-pad narrow" style={{ textAlign: "center", paddingTop: 80 }}>
        <p>{t("orderNotFound")}</p>
      </main>
    )
  }

  if (order.orderStatus === "rejected") {
    return (
      <main className="page-pad narrow">
        <section className="status-panel rejected-order-panel" role="alert" aria-live="assertive">
          <StatusBadge type="payment" value="rejected" label={t("rejected")} />
          <div style={{ marginBlock: 16 }}>
            <p className="eyebrow">{t("orderRejected")}</p>
            <h2>{t("rejectedTryAgain")}</h2>
            {order.rejectionReason ? (
              <p style={{ background: "var(--bg-muted)", padding: 12, borderRadius: 8, marginTop: 12 }}>
                {order.rejectionReason}
              </p>
            ) : null}
            <p style={{ marginTop: 8, opacity: 0.7 }}>{t("rejectedTryAgainBody")}</p>
          </div>
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", opacity: 0.6, fontSize: "0.9rem" }}>Order items</summary>
            <div className="summary-panel" style={{ marginTop: 8 }}>
              {(order.items || []).map((item, index) => (
                <div className="summary-line" key={`${item.itemId}-${index}`}>
                  <strong>{item.quantity} x {item.name}</strong>
                </div>
              ))}
              <div className="total-row grand-total">
                <span>{t("total")}</span>
                <strong>{money(order.totalAmount)}</strong>
              </div>
            </div>
          </details>
          <Link className="back-to-menu-btn" to={`/${cafeSlug}/menu${order.tableNumber ? `?table=${order.tableNumber}` : ""}`} aria-label={t("backToMenu")} title={t("backToMenu")}>
            <ArrowLeft size={18} />
          </Link>
        </section>
      </main>
    )
  }

  const steps = ["received", "accepted", "preparing", "ready"]
  const ready = isOrderReady(order)
  const statusIndex = ready ? steps.length - 1 : steps.indexOf(order.orderStatus)
  const isPaid = order.paymentStatus === "paid" || order.orderStatus === "paid"

  const handleProofBlob = async (blob) => {
    setProofError("")
    try {
      const paymentProofUrl = await uploadPaymentProof(orderId, blob)
      setOrder((prev) => prev ? { ...prev, paymentProofUrl, paymentStatus: "pending" } : prev)
    } catch (err) {
      setProofError(toUserMessage(err, "Upload failed."))
    }
  }

  return (
    <main className="page-pad narrow order-page">

      <div className="order-page-top-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Link
          to={`/${cafeSlug}/menu${order.tableNumber ? `?table=${order.tableNumber}` : ""}`}
          className="back-to-menu-btn"
          aria-label={t("backToMenu")}
          title={t("backToMenu")}
        >
          <ArrowLeft size={18} />
        </Link>
        <NotificationSettings orderId={orderId} role="customer" buttonLabel={t("enableReadyNotification")} compact />
      </div>

      {!["ready", "paid", "rejected"].includes(order.orderStatus) ? (
        <div className="order-time-bar">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={16} strokeWidth={1.8} />
            <strong>{t("estimatedReadyTime")}</strong>
          </span>
          <span>
            {(() => {
              const estMins = Math.max(1, Number(order.estimatedReadyMinutes || 15))
              if (["received", "accepted"].includes(order.orderStatus)) {
                return <span>~{estMins} {t("minutes")}</span>
              }
              if (order.orderStatus === "preparing") {
                if (order.autoReadyAt) {
                  return <strong className="countdown">Ready in {formatCountdown(order.autoReadyAt, clock)}</strong>
                }
                return <span>~{estMins} {t("minutes")}</span>
              }
              return null
            })()}
          </span>
        </div>
      ) : null}

      <div className="order-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">{t("order")} #{orderId?.slice(-6)}</p>
          <h1 style={{ margin: 0 }}>{t("table")} {order.tableNumber}</h1>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <StatusBadge type="payment" value={order.paymentStatus} label={t(order.paymentStatus)} />
          {order.paymentMethod ? <span className="badge">{paymentOptions.find((o) => o.type === order.paymentMethod)?.name || order.paymentMethod}</span> : null}
        </div>
      </div>

      <section className="summary-panel status-panel-compact" style={{ overflow: "visible" }}>
        <div className="stepper-timeline">
          <div
            className="stepper-timeline-progress"
            style={{ width: `${(Math.max(0, statusIndex) / (steps.length - 1)) * 100}%` }}
          />
          {steps.map((step, i) => {
            const meta = stepMeta[step]
            if (!meta) return <div key={step} />
            const Icon = meta.icon
            const done = i <= statusIndex
            const isCurrent = i === statusIndex
            return (
              <div
                key={step}
                className={`stepper-timeline-node ${done ? "done" : ""} ${isCurrent ? "active" : ""}`}
              >
                <div className="stepper-timeline-circle">
                  {done && i < steps.length - 1 ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                </div>
                <p className="stepper-timeline-label">{t(meta.labelKey)}</p>
                {(() => {
                  const ts = orderTimestamp(order, step)
                  return ts ? (
                    <p className="stepper-timeline-time">{t(meta.timeKey)} · {formatTime(ts)}</p>
                  ) : null
                })()}
              </div>
            )
          })}
        </div>
      </section>

      {ready ? (
        <section className="summary-panel success-order-panel" role="status">
          <span className="success-order-icon"><CheckCircle2 size={26} /></span>
          <div>
            <h2 style={{ margin: 0 }}>{t("orderReady")}</h2>
            <p style={{ margin: "6px 0 0", opacity: 0.75 }}>{t("orderReadyBody")}</p>
          </div>
        </section>
      ) : null}

      {isPaid ? (
        <section className="summary-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={18} style={{ color: "var(--accent)" }} />
            <span>{t("paymentReceived")}</span>
          </div>
          <p style={{ marginTop: 8, opacity: 0.7, fontSize: "0.9rem" }}>{t("receiptTableMessage")}</p>
          {order.paymentMethod ? <span className="badge">{paymentOptions.find((o) => o.type === order.paymentMethod)?.name || order.paymentMethod}</span> : null}
        </section>
      ) : order.orderStatus === "ready" || order.paymentMethod ? (
        <section className="summary-panel">
          <p className="eyebrow" style={{ marginBottom: 8 }}>{t("paymentMethod")}</p>

          {!order.paymentMethod ? (
            <>
              <p style={{ marginBottom: 8, opacity: 0.7, fontSize: "0.9rem" }}>{t("choosePaymentMethod")}</p>
              {proofError ? <p className="form-error" style={{ marginBottom: 8 }}>{proofError}</p> : null}
              <div style={{ display: "grid", gap: 8 }}>
                {paymentOptions.length === 0 ? (
                  <p style={{ opacity: 0.5, fontSize: "0.9rem" }}>{t("noPaymentMethods")}</p>
                ) : paymentOptions.map((opt) => {
                  // Store the semantic option type ("Cash", "Bank", ...) so
                  // cashier/admin screens match methods reliably.
                  const methodVal = opt.type || opt.name
                  const isSelected = selectedMethod === methodVal || selectedMethod === opt.type
                  return (
                    <label
                      key={opt.id}
                      className={`payment-option-card ${isSelected ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value={methodVal}
                        checked={isSelected}
                        onChange={() => setSelectedMethod(methodVal)}
                        style={{ accentColor: "var(--brand)" }}
                      />
                      <div className="payment-option-content">
                        <div className="payment-option-head">
                          <strong>{opt.name || opt.type}</strong>
                        </div>
                        {opt.accountNumber && opt.type !== "Cash" ? (
                          <p className="payment-option-sub">
                            {t("accountLabel")} <strong>{opt.accountNumber}</strong> {opt.accountHolder ? `(${opt.accountHolder})` : ""}
                          </p>
                        ) : null}
                        {opt.instructions && opt.type !== "Cash" ? (
                          <p className="payment-option-sub">{opt.instructions}</p>
                        ) : null}
                      </div>
                    </label>
                  )
                })}
              </div>
              <button
                className="primary-button"
                type="button"
                style={{ marginTop: 14, width: "100%" }}
                disabled={!selectedMethod}
                onClick={async () => {
                  setProofError("")
                  try {
                    await updateCustomerOrder(orderId, { paymentMethod: selectedMethod })
                  } catch (err) {
                    setProofError(toUserMessage(err, "Could not select payment method."))
                  }
                }}
              >
                {t("payWith")} {selectedMethod || "..."}
              </button>
            </>
          ) : isCashPayment(order.paymentMethod) ? (
            <div className="bank-payment-card cash-pending-card">
              <div className="bank-step-section">
                <div className="bank-step-header">
                  <span className="step-badge">Cash</span>
                  <h4>Cash Payment &mdash; Pending Cashier Confirmation</h4>
                </div>
                <div className="bank-details-box">
                  <div className="bank-instructions-box">
                    <Clock size={18} style={{ color: "#d97706", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ margin: 0 }}>
                      Please hand cash payment of <strong>{money(order.totalAmount)}</strong> to the cashier or staff at the counter. The cashier will confirm receipt directly from the POS/KDS interface.
                    </p>
                  </div>
                </div>
                <button
                  className="change-payment-method-btn"
                  type="button"
                  onClick={() => updateCustomerOrder(orderId, { clearMethod: true })}
                >
                  <RotateCcw size={14} />
                  <span>Change Payment Method</span>
                </button>
              </div>
            </div>
          ) : order.paymentStatus === "pending" ? (
            <div className="bank-payment-card">
              <div className="bank-step-header">
                <Clock size={20} style={{ color: "#d97706" }} />
                <h4>{t("paymentProofPending")}</h4>
              </div>
              {order.paymentProofUrl && isSafeStorageUrl(order.paymentProofUrl) ? (
                <div className="uploaded-proof-preview">
                  <p className="bank-field-label">{t("uploadedProof")}</p>
                  <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer">
                    <OptimizedImage src={order.paymentProofUrl} alt="Proof" fallbackType="receipt" aspectRatio="4/3" style={{ maxWidth: 240, borderRadius: 6 }} />
                  </a>
                </div>
              ) : order.paymentProofUrl ? (
                <div className="uploaded-proof-preview">
                  <p className="bank-field-label">{t("uploadedProof")}</p>
                  <p className="form-error" style={{ marginTop: 8 }}>Invalid proof URL</p>
                </div>
              ) : null}
            </div>
          ) : order.paymentStatus === "rejected" ? (
            <div className="bank-payment-card">
              <div className="bank-step-header">
                <XCircle size={20} style={{ color: "#c93b2b" }} />
                <h4>{t("paymentProofRejected")}</h4>
              </div>
              {order.paymentProofUrl && isSafeStorageUrl(order.paymentProofUrl) ? (
                <div className="uploaded-proof-preview">
                  <p className="bank-field-label">{t("previousProof")}</p>
                  <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer">
                    <OptimizedImage src={order.paymentProofUrl} alt="Proof" fallbackType="receipt" aspectRatio="4/3" style={{ maxWidth: 240, borderRadius: 6 }} />
                  </a>
                </div>
              ) : order.paymentProofUrl ? (
                <div className="uploaded-proof-preview">
                  <p className="bank-field-label">{t("previousProof")}</p>
                  <p className="form-error" style={{ marginTop: 8 }}>Invalid proof URL</p>
                </div>
              ) : null}
              {proofError ? <p className="form-error">{proofError}</p> : null}
              <div className="bank-upload-step">
                <div className="bank-step-header">
                  <span className="step-badge">Upload</span>
                  <h4>{t("reUploadProof")}</h4>
                </div>
                <ImageUploader
                  value={order.paymentProofUrl}
                  onChange={handleProofBlob}
                  onRemove={async () => {
                    await updateCustomerOrder(orderId, { clearProof: true })
                    setOrder((prev) => prev ? { ...prev, paymentProofUrl: "", paymentStatus: "unpaid" } : prev)
                  }}
                  label={t("reUploadProof")}
                  accept="image/*"
                />
              </div>
            </div>
          ) : (
            <div className="bank-payment-card">
              {(() => {
                const option = paymentOptions.find(
                  (o) => o.name === order.paymentMethod || o.type === order.paymentMethod
                )
                return (
                  <div className="bank-step-section">
                    <div className="bank-step-header">
                      <span className="step-badge">Step 1</span>
                      <h4>Transfer to {option?.name || order.paymentMethod}</h4>
                    </div>
                    <div className="bank-details-box">
                      <div className="bank-amount-row">
                        <span>Amount to transfer:</span>
                        <strong className="bank-amount-val">{money(order.totalAmount)}</strong>
                      </div>
                      {option?.accountNumber ? (
                        <div className="bank-info-row">
                          <div>
                            <span className="bank-info-label">{t("accountLabel")}</span>
                            <div className="bank-account-num">{option.accountNumber}</div>
                          </div>
                          <button
                            type="button"
                            className="copy-account-btn"
                            onClick={() => {
                              navigator.clipboard.writeText(option.accountNumber)
                              setCopiedAccount(true)
                              setTimeout(() => setCopiedAccount(false), 2000)
                            }}
                          >
                            {copiedAccount ? <Check size={14} /> : <Copy size={14} />}
                            {copiedAccount ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      ) : null}
                      {option?.accountHolder ? (
                        <div className="bank-info-row">
                          <div>
                            <span className="bank-info-label">{t("holderLabel")}</span>
                            <div><strong>{option.accountHolder}</strong></div>
                          </div>
                        </div>
                      ) : null}
                      {option?.instructions ? (
                        <div className="bank-instructions-box">
                          <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                          <p style={{ margin: 0 }}>{option.instructions}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })()}

              <div className="bank-step-section">
                <div className="bank-step-header">
                  <span className="step-badge step-2">Step 2</span>
                  <h4>{t("uploadPaymentProof")}</h4>
                </div>
                <p style={{ margin: "0 0 6px", fontSize: "0.85rem", color: "#586863" }}>
                  {t("uploadProofAfterTransfer")}
                </p>
                {proofError ? <p className="form-error">{proofError}</p> : null}
                <ImageUploader
                  value={order.paymentProofUrl}
                  onChange={handleProofBlob}
                  onRemove={async () => {
                    await updateCustomerOrder(orderId, { clearProof: true })
                    setOrder((prev) => prev ? { ...prev, paymentProofUrl: "", paymentStatus: "unpaid" } : prev)
                  }}
                  label={t("paymentProof")}
                  accept="image/*"
                />
              </div>
              <button
                className="change-payment-method-btn"
                type="button"
                onClick={() => updateCustomerOrder(orderId, { clearMethod: true })}
              >
                <RotateCcw size={14} />
                <span>Change Payment Method</span>
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section className="summary-panel">
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          {order.items?.length || 0} items <ArrowUpRight size={14} style={{ verticalAlign: "middle", opacity: 0.5 }} />
        </p>
        {(order.items || []).map((item, index) => (
          <div className="summary-line" key={`${item.itemId}-${index}`}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>
                {item.quantity} x {item.name}
              </strong>
              {item.calories != null ? (
                <p className="cart-calories">
                  <Flame size={12} /> {caloriesLabel(cartLineCalories(item))}
                </p>
              ) : null}
              {item.estimatedMinutes ? <p>{t("estimatedTime")}: {item.estimatedMinutes} {t("minutes")}</p> : null}
              <p>{formatIngredientSelections(item, t("ingredients"), t("removed"))}</p>
              {formatCustomizations(item.customizations, t("noSelection"), { Ingredients: t("ingredients") }) ? (
                <p>{formatCustomizations(item.customizations, t("noSelection"), { Ingredients: t("ingredients") })}</p>
              ) : null}
            </div>
            <strong className="summary-line-price">{money((Number(item.price) || 0) * Number(item.quantity || 1))}</strong>
          </div>
        ))}
        <div className="total-row">
          <span>{t("subtotal")}</span>
          <strong>{money(order.subtotalAmount ?? order.totalAmount)}</strong>
        </div>
        {(() => {
          const orderCalories = (order.items || []).reduce(
            (sum, item) => sum + Math.round(Number(item.calories || 0) * Number(item.quantity || 1)),
            0,
          )
          return orderCalories > 0 ? (
            <div className="total-row calorie-total-row">
              <span><Flame size={14} /> {t("totalCalories")}</span>
              <strong>{caloriesLabel(orderCalories)}</strong>
            </div>
          ) : null
        })()}
        {order.discountAmount ? (
          <div className="total-row">
            <span>{t("discount")}</span>
            <strong>{money(order.discountAmount)}</strong>
          </div>
        ) : null}
        <div className="total-row">
          <span>{t("tax")} ({Number(order.taxRate ?? billingSettings.taxRate ?? 0)}%)</span>
          <strong>{money(order.taxAmount || 0)}</strong>
        </div>
        <div className="total-row grand-total">
          <span>{t("total")}</span>
          <strong>{money(order.totalAmount)}</strong>
        </div>
      </section>

      {paymentConfirmedPopup}
    </main>
  )
}
