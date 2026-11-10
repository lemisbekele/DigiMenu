import { toUserMessage } from "../services/userMessages"
import "./customer-menu.css"
import { useEffect, useMemo, useRef, useState } from "react"
import { newOrderToken } from "../services/orderAccess"
import { ArrowLeft, Flame, Trash2 } from "lucide-react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { useCart } from "../context/cartContextValue"
import { useLanguage } from "../context/languageContextValue"
import { useTable } from "../context/tableContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { DEFAULT_BILLING_SETTINGS } from "../services/billingSettings"
import { saveOrderRecord } from "../services/orderHistoryService"
import {
  createOrder,
  fetchCustomerOrder,
  calculateTotals,
  caloriesLabel,
  cartLineCalories,
  itemChanges,
  money,
  observeBillingSettings,
  observePaymentOptions,
} from "../services/dataService"

export function CheckoutPage() {
  const { tableNumber } = useTable()
  const cafeSlug = useCafeSlug()
  const { items, clearCart, totalCalories, lineTotal, removeItem } = useCart()
  const [placing, setPlacing] = useState(false)
  const submittingRef = useRef(false)
  const requestToken = useRef(null)
  const [error, setError] = useState("")
  const [billingSettings, setBillingSettings] = useState(DEFAULT_BILLING_SETTINGS)
  const [paymentOptions, setPaymentOptions] = useState([])
  const [paymentMethod, setPaymentMethod] = useState("")
  const navigate = useNavigate()
  const { t } = useLanguage()

  useEffect(() => { return observeBillingSettings(setBillingSettings) }, [])

  useEffect(() => {
    return observePaymentOptions((opts) => {
      const active = opts.filter((o) => o.active)
      setPaymentOptions(active)
    })
  }, [])

  const activeMethods = useMemo(
    () => {
      const configured = paymentOptions.filter((o) => o.active && o.type)
      const cashDefault = { id: "on-hand", type: "Cash", name: "Cash (Pay on hand)" }
      const hasCash = configured.some((o) => o.type === "Cash")
      return hasCash ? configured : [cashDefault, ...configured]
    },
    [paymentOptions],
  )

  useEffect(() => {
    if (!paymentMethod && activeMethods.length) setPaymentMethod(activeMethods[0].type)
  }, [activeMethods, paymentMethod])

  const totals = useMemo(
    () => calculateTotals(items, { taxRate: Number(billingSettings.taxRate || 0) }),
    [billingSettings.taxRate, items],
  )

  const estimatedMinutes = useMemo(() => {
    const times = items.map((item) => Number(item.estimatedMinutes || item.prepTime || 0)).filter((t) => t > 0)
    return times.length > 0 ? Math.max(...times) : 15
  }, [items])

  if (!tableNumber) return <Navigate to={`/${cafeSlug}/menu`} replace />

  const placeOrder = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    requestToken.current ||= newOrderToken()
    setPlacing(true)
    setError("")
    try {
      const orderId = await createOrder({
        tableNumber,
        items: items.map(({ cartId: _cartId, ...item }) => item),
        estimatedReadyMinutes: estimatedMinutes,
        paymentMethod,
        requestToken: requestToken.current,
      })
      const placed = await fetchCustomerOrder(orderId)
      saveOrderRecord(placed)
      clearCart()
      // Straight to tracking: it shows the order, its progress and how to pay, so no extra confirmation screen.
      navigate(`/${cafeSlug}/order/${orderId}?table=${tableNumber}&placed=1`, { replace: true })
    } catch (err) {
      setError(toUserMessage(err, "Something went wrong."))
    } finally {
      submittingRef.current = false
      setPlacing(false)
    }
  }

  return (
    <main className="page-pad narrow checkout-page">
      <Link
        to={`/${cafeSlug}/menu${tableNumber ? `?table=${tableNumber}` : ""}`}
        className="back-to-menu-btn"
        aria-label={t("backToMenu")}
        title={t("backToMenu")}
      >
        <ArrowLeft size={18} />
      </Link>

      <h1 className="checkout-title">{t("reviewOrder", "Review your order")}</h1>
      <p className="checkout-meta">{t("table")} {tableNumber}{estimatedMinutes ? ` · ~${estimatedMinutes} ${t("minutes")}` : ""}</p>

      {items.length === 0 ? (
        <section className="summary-panel">
          <div className="empty-state">
            <p>{t("yourCartEmpty")}</p>
            <Link
              className="primary-button"
              style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8 }}
              to={`/${cafeSlug}/menu${tableNumber ? `?table=${tableNumber}` : ""}`}
            >
              <ArrowLeft size={16} /> Browse menu
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="summary-panel">
            {items.map((item) => (
              <div className="summary-line checkout-item" key={item.cartId}>
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
                <div className="summary-line-actions">
                  <span>{money(lineTotal(item))}</span>
                  <button
                    className="checkout-remove"
                    type="button"
                    onClick={() => removeItem(item.cartId)}
                    aria-label={`${t("removeItem")}: ${item.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="summary-panel totals-panel">
            <div className="total-row">
              <span>{t("subtotal")}</span>
              <strong>{money(totals.subtotalAmount)}</strong>
            </div>
            {totals.discountAmount ? (
              <div className="total-row">
                <span>{t("discount")}</span>
                <strong>{money(totals.discountAmount)}</strong>
              </div>
            ) : null}
            <div className="total-row">
              <span>{t("tax")} ({totals.taxRate}%)</span>
              <strong>{money(totals.taxAmount)}</strong>
            </div>
            {totalCalories > 0 ? (
              <div className="total-row calorie-total-row">
                <span><Flame size={14} /> {t("totalCalories")}</span>
                <strong>{caloriesLabel(totalCalories)}</strong>
              </div>
            ) : null}
            <div className="total-row grand-total">
              <span>{t("total")}</span>
              <strong>{money(totals.totalAmount)}</strong>
            </div>
          </section>



          {/* Big tap targets instead of a dropdown: there are only a few choices. */}
          <fieldset className="checkout-methods">
            <legend>{t("paymentMethod", "How will you pay?")}</legend>
            {activeMethods.map((method) => (
              <label key={method.id} className="checkout-method">
                <input type="radio" name="payment-method" value={method.type} checked={paymentMethod === method.type} onChange={() => setPaymentMethod(method.type)} />
                <span>{method.name || method.type}</span>
              </label>
            ))}
          </fieldset>
          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="checkout-sticky-footer">
            <button
              className="primary-button place-order-btn"
              type="button"
              disabled={placing}
              onClick={placeOrder}
            >
              {placing ? t("placingOrder") : `${t("placeOrder")} — ${money(totals.totalAmount)}`}
            </button>
          </div>
        </>
      )}
    </main>
  )
}

