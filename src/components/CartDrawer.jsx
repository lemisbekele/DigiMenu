import { useEffect, useMemo, useRef, useState } from "react"
import { Flame, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useCart } from "../context/cartContextValue"
import { useLanguage } from "../context/languageContextValue"
import { useTable } from "../context/tableContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { DEFAULT_BILLING_SETTINGS } from "../services/billingSettings"
import { newOrderToken } from "../services/orderAccess"
import { saveOrderRecord } from "../services/orderHistoryService"
import { toUserMessage } from "../services/userMessages"
import { calculateTotals, caloriesLabel, cartLineCalories, createOrder, fetchCustomerOrder, itemChanges, money, observeBillingSettings } from "../services/dataService"

// The cart is the checkout: review, then place the order. Payment is chosen on the order page afterwards.
export function CartDrawer() {
  const { cartOpen, setCartOpen, items, totalCalories, itemCount, updateQuantity, removeItem, lineTotal, clearCart } =
    useCart()
  const { tableNumber } = useTable()
  const cafeSlug = useCafeSlug()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [billingSettings, setBillingSettings] = useState(DEFAULT_BILLING_SETTINGS)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState("")
  const submittingRef = useRef(false)
  const requestToken = useRef(null)

  useEffect(() => { return observeBillingSettings(setBillingSettings) }, [])

  const totals = useMemo(
    () => calculateTotals(items, { taxRate: Number(billingSettings.taxRate || 0) }),
    [billingSettings.taxRate, items],
  )

  const placeOrder = async () => {
    if (submittingRef.current || !items.length) return
    if (!tableNumber) return setError(t("scanTableQr", "Please scan your table QR code"))
    submittingRef.current = true
    // Same token on retry, so a double tap or a retry after a network error never makes two orders.
    requestToken.current ||= newOrderToken()
    setPlacing(true)
    setError("")
    try {
      const times = items.map((item) => Number(item.estimatedMinutes || item.prepTime || 0)).filter((m) => m > 0)
      const orderId = await createOrder({
        tableNumber,
        items: items.map(({ cartId: _cartId, ...item }) => item),
        estimatedReadyMinutes: times.length ? Math.max(...times) : 15,
        requestToken: requestToken.current,
      })
      saveOrderRecord(await fetchCustomerOrder(orderId))
      requestToken.current = null
      clearCart()
      setCartOpen(false)
      navigate(`/${cafeSlug}/order/${orderId}?table=${tableNumber}&placed=1`)
    } catch (err) {
      setError(toUserMessage(err, "Something went wrong."))
    } finally {
      submittingRef.current = false
      setPlacing(false)
    }
  }

  return (
    <>
      {itemCount > 0 && !cartOpen ? (
        // Full-width bar instead of a floating bubble, so it never covers a menu item's button.
        <button className="cart-bar" type="button" onClick={() => setCartOpen(true)}>
          <span className="cart-bar-count">{itemCount}</span>
          <span className="cart-bar-label">{t("reviewOrder", "Review order")}</span>
          <span className="cart-bar-total">{money(totals.totalAmount)}</span>
        </button>
      ) : null}
      <aside className={`cart-drawer ${cartOpen ? "open" : ""}`} aria-hidden={!cartOpen}>
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{t("currentOrder")}</p>
            <h2>{t("yourCart")}</h2>
          </div>
          <button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label={t("closeCart")}>
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="empty-cart-view">
              <div className="empty-cart-icon">
                <ShoppingBag size={36} />
              </div>
              <p>{t("yourCartEmpty")}</p>
            </div>
          ) : (
            items.map((item) => (
              <article className="cart-line" key={item.cartId}>
                <div className="cart-line-header">
                  <div className="cart-line-title">
                    <h3>{item.name}</h3>
                    {item.calories != null ? (
                      <span className="cart-calories" title={`${caloriesLabel(cartLineCalories(item))}`}>
                        <Flame size={12} /> {caloriesLabel(cartLineCalories(item))}
                      </span>
                    ) : null}
                    {item.estimatedMinutes ? (
                      <span className="cart-prep-time">{item.estimatedMinutes} {t("minutes")}</span>
                    ) : null}
                  </div>
                  <strong className="cart-line-total">{money(lineTotal(item))}</strong>
                </div>
                <div className="cart-line-details">
                  {/* Only what the customer changed, not every ingredient. */}
                  {itemChanges(item).map((text) => <p key={text}>{text}</p>)}
                  {item.notes ? <p className="cart-note">{t("note")}: {item.notes}</p> : null}
                </div>
                <div className="quantity-row">
                  <div className="qty-controls">
                    <button
                      className="icon-button small qty-btn"
                      type="button"
                      onClick={() => updateQuantity(item.cartId, item.quantity - 1)}
                      aria-label={t("decreaseQuantity")}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="qty-count">{item.quantity}</span>
                    <button
                      className="icon-button small qty-btn"
                      type="button"
                      onClick={() => updateQuantity(item.cartId, item.quantity + 1)}
                      aria-label={t("increaseQuantity")}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    className="icon-button small danger-button remove-cart-item"
                    type="button"
                    onClick={() => removeItem(item.cartId)}
                    aria-label={t("removeItem")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <div className="drawer-foot">
          <div className="total-row">
            <span>{t("subtotal")}</span>
            <strong>{money(totals.subtotalAmount)}</strong>
          </div>
          {totalCalories > 0 ? (
            <div className="total-row calorie-total-row">
              <span><Flame size={14} /> {t("totalCalories")}</span>
              <strong>{caloriesLabel(totalCalories)}</strong>
            </div>
          ) : null}
          <div className="total-row">
            <span>{t("tax")} ({totals.taxRate}%)</span>
            <strong>{money(totals.taxAmount)}</strong>
          </div>
          <div className="total-row grand-total">
            <span>{t("total")}</span>
            <strong>{money(totals.totalAmount)}</strong>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button place-order-btn" type="button" disabled={placing || items.length === 0} onClick={placeOrder}>
            {placing ? t("placingOrder") : `${t("placeOrder")} — ${money(totals.totalAmount)}`}
          </button>
          <p className="cart-pay-hint">{t("payAfterOrder", "You choose how to pay after placing the order.")}</p>
        </div>
      </aside>
      {cartOpen ? <button className="drawer-scrim" aria-label={t("closeCart")} onClick={() => setCartOpen(false)} /> : null}
    </>
  )
}

