import { useEffect, useMemo, useState } from "react"
import { Flame, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { useCart } from "../context/cartContextValue"
import { useLanguage } from "../context/languageContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { DEFAULT_BILLING_SETTINGS } from "../services/billingSettings"
import { calculateTotals, caloriesLabel, cartLineCalories, formatCustomizations, formatIngredientSelections, money, observeBillingSettings } from "../services/dataService"

export function CartDrawer() {
  const { cartOpen, setCartOpen, items, subtotal, totalCalories, itemCount, updateQuantity, removeItem, lineTotal } =
    useCart()
  const [searchParams] = useSearchParams()
  const table = searchParams.get("table")
  const cafeSlug = useCafeSlug()
  const { t } = useLanguage()
  const [billingSettings, setBillingSettings] = useState(DEFAULT_BILLING_SETTINGS)

  useEffect(() => { return observeBillingSettings(setBillingSettings) }, [])

  const totals = useMemo(
    () => calculateTotals(items, { taxRate: Number(billingSettings.taxRate || 0) }),
    [billingSettings.taxRate, items],
  )

  return (
    <>
      <button className="floating-cart" type="button" onClick={() => setCartOpen(true)}>
        <ShoppingBag size={20} />
        <span>{itemCount}</span>
      </button>
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
                  <p>{formatIngredientSelections(item, t("ingredients"), t("removed"))}</p>
                  {formatCustomizations(item.customizations, t("noSelection"), { Ingredients: t("ingredients") }) ? (
                    <p>{formatCustomizations(item.customizations, t("noSelection"), { Ingredients: t("ingredients") })}</p>
                  ) : null}
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
            <strong>{money(totals.subtotalAmount || subtotal)}</strong>
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
          <Link
            className={`primary-button ${items.length === 0 ? "disabled" : ""}`}
            to={`/${cafeSlug}/checkout${table ? `?table=${table}` : ""}`}
            onClick={(event) => {
              if (items.length === 0) event.preventDefault()
            }}
          >
            {t("checkout")}
          </Link>
        </div>
      </aside>
      {cartOpen ? <button className="drawer-scrim" aria-label={t("closeCart")} onClick={() => setCartOpen(false)} /> : null}
    </>
  )
}

