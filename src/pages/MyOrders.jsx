import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Clock, Coffee, PackageCheck, Receipt, ShoppingBag } from "lucide-react"
import { Link } from "react-router-dom"
import { StatusBadge } from "../components/StatusBadge"
import { useLanguage } from "../context/languageContextValue"
import { useTable } from "../context/tableContextValue"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { observeOrdersByIds, money } from "../services/dataService"
import { readOrderRecords } from "../services/orderHistoryService"

const ACTIVE_STATUSES = ["received", "accepted", "preparing", "ready"]

export function MyOrdersPage() {
  const { t } = useLanguage()
  const { tableNumber } = useTable()
  const cafeSlug = useCafeSlug()
  const [liveOrders, setLiveOrders] = useState([])
  const [records, setRecords] = useState([])

  useEffect(() => {
    const ids = readOrderRecords().map((r) => r.id)
    return observeOrdersByIds(ids, setLiveOrders)
  }, [])

  useEffect(() => {
    setRecords(readOrderRecords())
  }, [liveOrders])

  const liveById = useMemo(
    () => Object.fromEntries(liveOrders.map((o) => [o.id, o])),
    [liveOrders],
  )

  const activateOrder = (record) => {
    const live = liveById[record.id]
    if (!live) return false
    return ACTIVE_STATUSES.includes(live.orderStatus) && live.paymentStatus !== "paid"
  }

  const active = records.filter(activateOrder)
  const history = records.filter((record) => !activateOrder(record))

  const goToTableParam = tableNumber ? `?table=${tableNumber}` : ""

  return (
    <main className="page-pad narrow my-orders-page">
      <header style={{ marginBottom: 16 }}>
        <p className="eyebrow">{t("myOrdersEyebrow")}</p>
        <h1 style={{ margin: 0 }}>{t("myOrders")}</h1>
      </header>

      <section>
        <div className="orders-section-head">
          <h2><span className="orders-section-icon"><ShoppingBag size={16} /></span> {t("activeOrders")}</h2>
        </div>
        {active.length === 0 ? (
          <div className="empty-state">
            <Coffee size={36} strokeWidth={1.5} opacity={0.4} />
            <p style={{ margin: 0 }}>{t("noActiveOrders")}</p>
            <Link className="primary-button" style={{ marginTop: 14 }} to={`/${cafeSlug}/menu${goToTableParam}`}>
              {t("browseMenu")}
            </Link>
          </div>
        ) : (
          <div className="my-orders-list">
            {active.map((record) => {
              const live = liveById[record.id]
              const status = live?.orderStatus || "received"
              const statusLabel = t(status) || status
              return (
                <article className="summary-panel order-card" key={record.id}>
                  <div className="order-card-top">
                    <div>
                      <p className="eyebrow" style={{ margin: 0 }}>{t("orderShort")} #{record.id.slice(-6)}</p>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                        {t("table")} {record.tableNumber} &middot; {money(record.totalAmount)}
                      </strong>
                    </div>
                    <StatusBadge type="order" value={status} label={statusLabel} />
                  </div>
                  <p className="order-card-meta">
                    <Clock size={13} /> {formatDateTime(record.placedAt || Date.now())}
                  </p>
                  <ul className="order-card-items">
                    {(record.items || []).slice(0, 6).map((item, index) => (
                      <li key={`${record.id}-${index}`}>{item.quantity} x {item.name}</li>
                    ))}
                    {(record.items || []).length > 6 ? (
                      <li className="order-card-more">+{(record.items || []).length - 6} {t("moreItems")}</li>
                    ) : null}
                  </ul>
                  <Link className="primary-button compact-btn track-order-btn" to={`/${cafeSlug}/order/${record.id}${goToTableParam}`}>
                    {t("trackOrder")} <ArrowRight size={15} />
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <div className="orders-section-head">
          <h2><span className="orders-section-icon"><Receipt size={16} /></span> {t("orderHistory")}</h2>
        </div>
        {history.length === 0 ? (
          <div className="empty-state" style={{ paddingBlock: 20 }}>
            <PackageCheck size={36} strokeWidth={1.5} opacity={0.4} />
            <p style={{ margin: 0 }}>{t("noOrderHistory")}</p>
          </div>
        ) : (
          <div className="my-orders-list">
            {history.map((record) => {
              const live = liveById[record.id]
              const status = live?.orderStatus || "paid"
              const statusLabel = t(status) || status
              const isPaid = live?.paymentStatus === "paid" || status === "paid"
              return (
                <article className="summary-panel order-card" key={record.id}>
                  <div className="order-card-top">
                    <div>
                      <p className="eyebrow" style={{ margin: 0 }}>{t("orderShort")} #{record.id.slice(-6)}</p>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                        {t("table")} {record.tableNumber} &middot; {money(record.totalAmount)}
                      </strong>
                    </div>
                    <StatusBadge type={isPaid ? "payment" : "order"} value={isPaid ? "paid" : status} label={isPaid ? t("paid") : statusLabel} />
                  </div>
                  <p className="order-card-meta">
                    <Clock size={13} /> {formatDateTime(record.placedAt || Date.now())}
                  </p>
                  <Link className="ghost-button compact-btn track-order-btn" to={`/${cafeSlug}/order/${record.id}${goToTableParam}`}>
                    {t("viewDetails")}
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
