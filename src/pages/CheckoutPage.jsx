import { toUserMessage } from "../services/userMessages"
import { useEffect, useMemo, useRef, useState } from "react"
import { newOrderToken } from "../services/orderAccess"
import { ArrowLeft, ArrowUpRight, CheckCircle2, Flame, Trash2 } from "lucide-react"
import { Link, Navigate } from "react-router-dom"
import { useCart } from "../context/cartContextValue"
import { useLanguage } from "../context/languageContextValue"
import { useTable } from "../context/tableContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { DEFAULT_BILLING_SETTINGS } from "../services/billingSettings"
import { saveOrderRecord } from "../services/orderHistoryService"
import {
  createOrder,
  fetchCustomerOrder,
  cartLineTotal,
  calculateTotals,
  caloriesLabel,
  cartLineCalories,
  formatCustomizations,
  formatIngredientSelections,
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
  const [placedOrder, setPlacedOrder] = useState(null)
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
      setPlacedOrder(placed)
    } catch (err) {
      setError(toUserMessage(err, "Something went wrong."))
    } finally {
      submittingRef.current = false
      setPlacing(false)
    }
  }

  if (placedOrder) {
    return (
      <main className="page-pad narrow checkout-page confirmation-page">
        <section className="summary-panel order-confirmation-panel" role="status" aria-live="polite">
          <span className="success-order-icon"><CheckCircle2 size={30} /></span>
          <p className="eyebrow" style={{ marginTop: 8 }}>{t("orderPlaced")}</p>
          <h1 style={{ marginTop: 4 }}>{t("orderShort")} #{placedOrder.id.slice(-6)}</h1>
          <p style={{ margin: "4px 0 0", opacity: 0.7 }}>{t("table")} {placedOrder.tableNumber} &middot; ~{placedOrder.estimatedReadyMinutes} {t("minutes")}</p>

          <div className="summary-panel confirmation-items" style={{ marginTop: 18 }}>
            {(placedOrder.items || []).map((item, index) => (
              <div className="summary-line" key={`${item.name}-${index}`}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {item.quantity} x {item.name}
                </span>
                <strong>{money(cartLineTotal(item))}</strong>
              </div>
            ))}
            <div className="total-row grand-total" style={{ marginTop: 8 }}>
              <span>{t("total")}</span>
              <strong>{money(placedOrder.totalAmount)}</strong>
            </div>
          </div>

          <div className="confirmation-actions" style={{ marginTop: 18 }}>
            <Link className="primary-button" to={`/${cafeSlug}/order/${placedOrder.id}?table=${placedOrder.tableNumber}`}>
              <ArrowUpRight size={16} /> {t("trackOrder")}
            </Link>
            <Link className="ghost-button" to={`/${cafeSlug}/menu?table=${placedOrder.tableNumber}`}>
              {t("orderMore")}
            </Link>
          </div>
        </section>
      </main>
    )
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

      <p className="eyebrow">{t("checkoutEyebrow")}</p>
      <h1>{t("checkout")} &mdash; {t("table")} {tableNumber}</h1>

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
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              {items.length} {items.length === 1 ? "item" : "items"}
              {estimatedMinutes ? ` · ~${estimatedMinutes} min` : null}
            </p>
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
                  {item.estimatedMinutes ? <p>{t("estimatedTime")}: {item.estimatedMinutes} {t("minutes")}</p> : null}
                  <p>{formatIngredientSelections(item, t("ingredients"), t("removed"))}</p>
                  {formatCustomizations(item.customizations, t("noSelection"), { Ingredients: t("ingredients") }) ? (
                    <p>{formatCustomizations(item.customizations, t("noSelection"), { Ingredients: t("ingredients") })}</p>
                  ) : null}
                </div>
                <div className="summary-line-actions">
                  <span>{money(lineTotal(item))}</span>
                  <button
                    className="icon-button small danger"
                    type="button"
                    onClick={() => removeItem(item.cartId)}
                    aria-label={t("removeItem")}
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



          <label className="field"><span>Payment method</span>
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              {activeMethods.map((method) => <option key={method.id} value={method.type}>{method.name || method.type}</option>)}
            </select>
          </label>
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

