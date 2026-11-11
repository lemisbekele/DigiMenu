import { toUserMessage } from "../services/userMessages"
import "./customer-menu.css"
import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, CheckCircle2, Clock, Coffee, CookingPot, Copy, Flame, Info, Receipt, TimerOff, XCircle } from "lucide-react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { NotificationSettings } from "../components/NotificationSettings"
import { StatusBadge } from "../components/StatusBadge"
import { useLanguage } from "../context/languageContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"

import { DEFAULT_BILLING_SETTINGS } from "../services/billingSettings"
import { ImageUploader } from "../components/ImageUploader"
import { showBrowserNotification } from "../services/notificationService"
import { isOrderReady } from "../services/kitchenAlerts"
import { cartLineTotal, itemChanges, money, observeBillingSettings, observeOrder, observePaymentOptions, customerPaymentMethods, updateCustomerOrder, uploadPaymentProof, caloriesLabel, cartLineCalories, isSafeStorageUrl } from "../services/dataService"
import { OptimizedImage } from "../components/OptimizedImage"
import { usePaymentConfirmedPopup } from "../hooks/usePaymentConfirmedPopup"

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
  received: { icon: Receipt, labelKey: "received", timeKey: "placedAt" },
  preparing: { icon: CookingPot, labelKey: "preparing", timeKey: "preparingTime" },
  ready: { icon: Coffee, labelKey: "ready", timeKey: "readyTime" },
}

function isCashPayment(method) {
  if (!method) return false
  const m = String(method).toLowerCase()
  return m === "cash" || m.includes("cash") || m.includes("hand") || m.includes("counter")
}

export function OrderPage() {
  const { orderId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  // Shown once after placing an order; the marker is then dropped so a refresh doesn't repeat it.
  const [justPlaced] = useState(() => searchParams.get("placed") === "1")
  useEffect(() => {
    if (!searchParams.has("placed")) return
    const next = new URLSearchParams(searchParams)
    next.delete("placed")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  const cafeSlug = useCafeSlug()
  const { t } = useLanguage()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [billingSettings, setBillingSettings] = useState(DEFAULT_BILLING_SETTINGS)
  const [paymentOptions, setPaymentOptions] = useState([])
  // Picked by option id: two methods can share a type (e.g. two "Bank"s) and must not light up together.
  const [selectedId, setSelectedId] = useState("")
  const selectedOption = paymentOptions.find((o) => o.id === selectedId)
  const selectedMethod = selectedOption ? selectedOption.type || selectedOption.name : ""
  const [proofError, setProofError] = useState("")
  const [copiedAccount, setCopiedAccount] = useState(false)
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
    return observePaymentOptions((opts) => setPaymentOptions(customerPaymentMethods(opts)))
  }, [])
  useEffect(() => {
    if (!order?.paymentMethod || selectedOption) return
    const saved = paymentOptions.find((o) => (o.type || o.name) === order.paymentMethod)
    if (saved) setSelectedId(saved.id)
  }, [order?.paymentMethod, paymentOptions, selectedOption])
  const { popup: paymentConfirmedPopup } = usePaymentConfirmedPopup(order)

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

  // "Preparing" comes from the kitchen queue: the oldest N open orders (server-worked-out position).
  const steps = ["received", "preparing", "ready"]
  const ready = isOrderReady(order)
  const inQueue = order.queuePosition != null
  const preparing = inQueue && order.queuePosition < Number(order.kitchenCapacity || 2)
  const statusIndex = ready ? 2 : preparing ? 1 : inQueue ? 0 : steps.indexOf(order.orderStatus)
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

      {justPlaced && !ready ? (
        <div className="order-placed-banner" role="status">
          <CheckCircle2 size={20} /> {t("orderSentToKitchen", "Order sent to the kitchen. This page updates by itself.")}
        </div>
      ) : null}
      {!["ready", "paid", "rejected"].includes(order.orderStatus) ? (
        <div className="order-time-bar">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={16} strokeWidth={1.8} />
            <strong>{t("estimatedReadyTime")}</strong>
          </span>
          <span>
            {preparing
              ? <strong>{t("beingPrepared", "Being prepared")} · ~{order.waitMinutes} {t("minutes")}</strong>
              : inQueue
              ? <strong>#{order.queuePosition + 1} {t("inLine", "in line")} · ~{order.waitMinutes} {t("minutes")}</strong>
              : <span>~{Math.max(1, Number(order.estimatedReadyMinutes || 15))} {t("minutes")}</span>}
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
      ) : (
        <section className="summary-panel">
          <p className="eyebrow" style={{ marginBottom: 8 }}>{t("paymentMethod")}</p>

          {/* Pay with: one button per method; switching is allowed until a proof is sent. */}
          {order.paymentStatus !== "pending" ? (
            <div className="pay-with" role="group" aria-label={t("paymentMethod")}>
              <span>{t("payWith", "Pay with")}:</span>
              {paymentOptions.length === 0 ? (
                <span style={{ opacity: 0.6 }}>{t("noPaymentMethods")}</span>
              ) : paymentOptions.map((opt) => {
                // Store the semantic option type ("Cash", "Bank", ...) so cashier/admin screens match methods reliably.
                const methodVal = opt.type || opt.name
                return (
                  <button key={opt.id} type="button" className="pay-with-option" aria-pressed={selectedId === opt.id} onClick={() => { setProofError(""); setSelectedId(opt.id) }}>
                    {isCashPayment(methodVal) ? "Cash" : opt.name || opt.type}
                  </button>
                )
              })}
            </div>
          ) : null}
          {proofError ? <p className="form-error" style={{ marginBottom: 8 }}>{proofError}</p> : null}

          {!selectedMethod ? (
            <p style={{ margin: 0, opacity: 0.7, fontSize: "0.9rem" }}>{t("choosePaymentMethod")}</p>
          ) : selectedMethod !== order.paymentMethod ? (
            (() => {
              const option = selectedOption
              const cash = isCashPayment(selectedMethod)
              return (
                <div className="bank-payment-card">
                  <div className="bank-details-box">
                    <div className="bank-amount-row">
                      <span>{cash ? "Amount to pay:" : "Amount to transfer:"}</span>
                      <strong className="bank-amount-val">{money(order.totalAmount)}</strong>
                    </div>
                    {!cash && option?.accountNumber ? (
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
                    {!cash && option?.accountHolder ? (
                      <div className="bank-info-row">
                        <div>
                          <span className="bank-info-label">{t("holderLabel")}</span>
                          <div><strong>{option.accountHolder}</strong></div>
                        </div>
                      </div>
                    ) : null}
                    {!cash && option?.instructions ? (
                      <div className="bank-instructions-box">
                        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                        <p style={{ margin: 0 }}>{option.instructions}</p>
                      </div>
                    ) : null}
                  </div>
                  {!cash ? (
                    <div className="pay-receipt">
                      <p className="bank-field-label">Receipt</p>
                      {(order.items || []).map((item, index) => (
                        <div className="total-row" key={`${item.itemId}-${index}`}>
                          <span>{item.quantity} x {item.name}</span>
                          <span>{money(cartLineTotal(item))}</span>
                        </div>
                      ))}
                      <div className="total-row">
                        <span>{t("tax")}</span>
                        <span>{money(order.taxAmount || 0)}</span>
                      </div>
                      <div className="total-row grand-total">
                        <span>{t("total")}</span>
                        <strong>{money(order.totalAmount)}</strong>
                      </div>
                    </div>
                  ) : null}
                  <button
                    className="primary-button"
                    type="button"
                    style={{ width: "100%" }}
                    onClick={async () => {
                      setProofError("")
                      try {
                        if (order.paymentMethod) await updateCustomerOrder(orderId, { clearMethod: true })
                        await updateCustomerOrder(orderId, { paymentMethod: selectedMethod })
                      } catch (err) {
                        setProofError(toUserMessage(err, "Could not select payment method."))
                      }
                    }}
                  >
                    Pay {money(order.totalAmount)}
                  </button>
                </div>
              )
            })()
          ) : isCashPayment(order.paymentMethod) ? (
            <div className="bank-payment-card cash-pending-card">
              <div className="bank-step-section">
                <div className="bank-step-header">
                  <span className="step-badge">Cash</span>
                  <h4>Pay with cash</h4>
                </div>
                <div className="bank-details-box">
                  <div className="bank-instructions-box">
                    <Clock size={18} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ margin: 0 }}>
                      Pay <strong>{money(order.totalAmount)}</strong> at the counter. Staff will mark your order as paid.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : order.paymentStatus === "pending" ? (
            <div className="bank-payment-card">
              <div className="bank-step-header">
                <Clock size={20} style={{ color: "var(--warning)" }} />
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
                <XCircle size={20} style={{ color: "var(--danger)" }} />
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
                const option = selectedOption?.type === order.paymentMethod ? selectedOption : paymentOptions.find(
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
                <p style={{ margin: "0 0 6px", fontSize: "0.85rem" }}>
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
            </div>
          )}
        </section>
      )}

      <section className="summary-panel">
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          {order.items?.length === 1 ? "1 item" : `${order.items?.length || 0} items`}
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
              {itemChanges(item).map((text) => <p key={text}>{text}</p>)}
              {item.notes ? <p className="cart-note">{t("note")}: {item.notes}</p> : null}
            </div>
            {/* Includes paid extras (e.g. oat milk), so the lines add up to the total. */}
            <strong className="summary-line-price">{money(cartLineTotal(item))}</strong>
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
