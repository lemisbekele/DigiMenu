import { useEffect, useRef, useState } from "react"
import { PaymentConfirmedPopup } from "../components/PaymentConfirmedPopup"
import { hasBeenShown } from "../services/paymentPopupState"

export function usePaymentConfirmedPopup(order) {
  const [show, setShow] = useState(false)
  const paidRef = useRef(false)
  const prevPaymentStatus = useRef(null)

  useEffect(() => {
    if (!order) return
    const pps = prevPaymentStatus.current
    prevPaymentStatus.current = order.paymentStatus

    if (
      order.paymentStatus === "paid" &&
      pps !== "paid" &&
      !paidRef.current &&
      !hasBeenShown(order.id)
    ) {
      paidRef.current = true
      setShow(true)
    }
  }, [order])

  const dismiss = () => setShow(false)

  if (!show || !order) return { show: false, popup: null }

  return {
    show,
    popup: (
      <PaymentConfirmedPopup
        orderId={order.id}
        totalAmount={order.totalAmount}
        orderNumber={String(order.id).slice(-6)}
        onDismiss={dismiss}
      />
    ),
  }
}
