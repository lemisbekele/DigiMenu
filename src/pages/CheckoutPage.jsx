import { useEffect } from "react"
import { Navigate } from "react-router-dom"
import { useCart } from "../context/cartContextValue"
import { useTable } from "../context/tableContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"

// Checkout now happens in the cart; old links land on the menu with the cart open.
export function CheckoutPage() {
  const { tableNumber } = useTable()
  const { setCartOpen } = useCart()
  const cafeSlug = useCafeSlug()
  useEffect(() => { setCartOpen(true) }, [setCartOpen])
  return <Navigate to={`/${cafeSlug}/menu${tableNumber ? `?table=${tableNumber}` : ""}`} replace />
}
