import { useEffect, useMemo, useState } from "react"
import { CartContext } from "./cartContextValue"
import { cartLineTotal, totalCalories } from "../services/dataService"

export function CartProvider({ children }) {
  const key = `cafe-cart:${window.location.pathname.split('/').filter(Boolean)[0] || ''}`
  const [items, setItems] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(key) || '[]'); return Array.isArray(saved) ? saved : [] } catch { return [] }
  })
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(items)) } catch {} }, [key, items])
  const [cartOpen, setCartOpen] = useState(false)

  const value = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + cartLineTotal(item), 0)
    return {
      items,
      cartOpen,
      subtotal,
      totalCalories: totalCalories(items),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      setCartOpen,
      clearCart: () => setItems([]),
      addItem: (item) => {
        setItems((current) => {
          if (current.some((entry) => entry.itemId === item.itemId)) return current
          return [...current, { ...item, cartId: item.itemId, quantity: 1 }]
        })
      },
      toggleItem: (item) => {
        setItems((current) => {
          if (current.some((entry) => entry.itemId === item.itemId)) {
            return current.filter((entry) => entry.itemId !== item.itemId)
          }
          return [...current, { ...item, cartId: item.itemId, quantity: 1 }]
        })
      },
      isItemSelected: (itemId) => items.some((item) => item.itemId === itemId),
      removeItemByItemId: (itemId) => setItems((current) => current.filter((item) => item.itemId !== itemId)),
      updateQuantity: (cartId, quantity) => {
        setItems((current) =>
          current
            .map((item) => (item.cartId === cartId ? { ...item, quantity: Math.min(100, Math.max(0, Math.floor(Number(quantity) || 0))) } : item))
            .filter((item) => item.quantity > 0),
        )
      },
      removeItem: (cartId) => setItems((current) => current.filter((item) => item.cartId !== cartId)),
      lineTotal: cartLineTotal,
    }
  }, [items, cartOpen])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

