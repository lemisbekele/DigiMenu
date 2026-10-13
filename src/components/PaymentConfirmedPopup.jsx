import { useEffect, useState } from "react"
import { CheckCircle2, X } from "lucide-react"
import { money } from "../services/dataService"
import { markShown } from "../services/paymentPopupState"

const DISMISS_DELAY = 6000

export function PaymentConfirmedPopup({ orderId, totalAmount, orderNumber, onDismiss }) {
  const [dismissing, setDismissing] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    markShown(orderId)
    const timer = setTimeout(() => {
      setDismissing(true)
      setTimeout(() => {
        setVisible(false)
        onDismiss?.()
      }, 400)
    }, DISMISS_DELAY)
    return () => clearTimeout(timer)
  }, [orderId, onDismiss])

  const handleDismiss = () => {
    setDismissing(true)
    setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, 400)
  }

  if (!visible) return null

  return (
    <div
      className={`payment-confirmed-overlay ${dismissing ? "fade-out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Payment confirmed"
    >
      <div className={`payment-confirmed-card ${dismissing ? "slide-down" : ""}`}>
        <button
          className="icon-button payment-confirmed-close"
          type="button"
          onClick={handleDismiss}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="payment-confirmed-icon-wrap">
          <div className="payment-confirmed-icon">
            <CheckCircle2 size={48} />
          </div>
        </div>

        <h2 className="payment-confirmed-title">Payment Confirmed!</h2>
        <p className="payment-confirmed-message">
          Thank you for your order. Your payment has been received successfully.
        </p>
        <p className="payment-confirmed-order">
          Order #{orderNumber}
        </p>
        {totalAmount != null ? (
          <p className="payment-confirmed-amount">{money(totalAmount)}</p>
        ) : null}
      </div>
    </div>
  )
}
