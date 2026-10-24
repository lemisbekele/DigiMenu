import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Clock,
  Coffee,
  CookingPot,
  Filter,
  Settings,
  Utensils,
  Volume2,
  VolumeX,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { beep, newOrderIds, soundReady, unlockSound } from "../services/kitchenAlerts"
import { OPEN_STATUSES } from "../services/kitchenQueue"
import { useKitchenQueue } from "../hooks/useKitchenQueue"
import {
  formatCustomizations,
  formatIngredientSelections,
  observeOrders,
  sendPushToCustomer,
  updateStaffOrder,
} from "../services/dataService"

// Columns are worked out from the queue: the oldest N open orders are "preparing", the rest wait in line.
const STEPS = OPEN_STATUSES

const TABS = [
  { key: "preparing", label: "Preparing", icon: CookingPot },
  { key: "received", label: "In line", icon: Clock },
]

const STATIONS = [
  { key: "all", label: "All Items", icon: Filter },
  { key: "kitchen", label: "Kitchen Staff", icon: Utensils },
  { key: "barista", label: "Barista", icon: Coffee },
]

const DRINK_KEYWORDS = [
  "coffee",
  "latte",
  "espresso",
  "cappuccino",
  "macchiato",
  "tea",
  "matcha",
  "smoothie",
  "juice",
  "beverage",
  "drink",
  "cold brew",
  "iced",
  "frappe",
  "milkshake",
  "soda",
  "water",
  "cocktail",
  "barista",
  "mocha",
  "americano",
  "flat white",
  "cortado",
  "brew",
  "beverages",
  "drinks",
  "chai",
  "drip",
  "pour over",
]

function isBaristaItem(item) {
  if (!item) return false
  const categoryStr = (item.category || "").toLowerCase()
  const subcategoryStr = (item.subcategory || "").toLowerCase()
  const nameStr = (item.name || "").toLowerCase()

  if (
    categoryStr.includes("drink") ||
    categoryStr.includes("beverage") ||
    categoryStr.includes("coffee") ||
    categoryStr.includes("barista") ||
    categoryStr.includes("tea")
  ) {
    return true
  }

  const haystack = `${nameStr} ${categoryStr} ${subcategoryStr}`
  return DRINK_KEYWORDS.some((kw) => haystack.includes(kw))
}

function matchesStation(order, stationFilter) {
  if (stationFilter === "all") return true
  const items = order.items || []
  if (stationFilter === "barista") return items.some((i) => isBaristaItem(i))
  if (stationFilter === "kitchen") return items.some((i) => !isBaristaItem(i))
  return true
}

function orderCreatedMs(order) {
  if (order.createdAtMs) return order.createdAtMs
  if (order.createdAt?.toDate) return order.createdAt.toDate().getTime()
  return new Date(order.createdAt || Date.now()).getTime()
}

function formatTime(totalSecs) {
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function elapsedColor(secs) {
  if (secs > 600) return "kds-timer-urgent"
  if (secs > 300) return "kds-timer-warn"
  return "kds-timer-ok"
}

function TicketTimer({ sinceMs }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const secs = Math.max(0, Math.floor((now - sinceMs) / 1000))
  return (
    <div className={`kds-ticket-timer ${elapsedColor(secs)}`}>
      <Clock size={16} />
      <span>{formatTime(secs)}</span>
    </div>
  )
}

function TicketSkeleton() {
  return (
    <div className="kds-ticket kds-ticket-skeleton">
      <div className="kds-skel-line" style={{ width: "45%", height: 28 }} />
      <div className="kds-skel-line" style={{ width: "30%", height: 32 }} />
      <div className="kds-skel-line" style={{ width: "75%", height: 16 }} />
      <div className="kds-skel-line" style={{ width: "55%", height: 16 }} />
      <div className="kds-skel-line" style={{ width: "100%", height: 48, borderRadius: 10 }} />
    </div>
  )
}

function EmptyState({ status, station }) {
  return (
    <div className="kds-empty">
      <ChefHat size={48} strokeWidth={1.5} />
      <p>
        {status === "received"
          ? station === "all"
            ? "Nobody waiting in line"
            : `No ${station} orders in line`
          : station === "all"
          ? "No orders in progress"
          : `No ${station} orders in progress`}
      </p>
    </div>
  )
}

export function KitchenKDS() {
  const cafeSlug = useCafeSlug()
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [activeTab, setActiveTab] = useState("received")
  const [stationFilter, setStationFilter] = useState("all")
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem("kds_muted") === "true"
  })

  const previousIds = useRef(null)
  const [soundBlocked, setSoundBlocked] = useState(true)
  const kanbanRef = useRef(null)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab

  // Sound needs one tap after each page load; any tap on the screen unlocks it.
  useEffect(() => {
    const unlock = () => unlockSound().then((ok) => setSoundBlocked(!ok))
    unlock()
    window.addEventListener("pointerdown", unlock)
    return () => window.removeEventListener("pointerdown", unlock)
  }, [])

  // Keep the kitchen tablet screen on; the browser drops the lock when the tab is hidden.
  useEffect(() => {
    let lock = null
    const request = () => {
      if (document.visibilityState === "visible") navigator.wakeLock?.request("screen").then((l) => { lock = l }).catch(() => {})
    }
    request()
    document.addEventListener("visibilitychange", request)
    return () => {
      document.removeEventListener("visibilitychange", request)
      lock?.release().catch(() => {})
    }
  }, [])

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev
      localStorage.setItem("kds_muted", String(next))
      return next
    })
  }

  const isMutedRef = useRef(isMuted)
  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  // Real-time Supabase subscription
  useEffect(() => {
    return observeOrders((nextOrders) => {
      // The first load only records what is already waiting; after that, any new order beeps.
      if (previousIds.current && newOrderIds(previousIds.current, nextOrders).length && !isMutedRef.current) {
        if (!beep()) setSoundBlocked(!soundReady())
      }
      previousIds.current = new Set(nextOrders.map((o) => o.id))
      setOrders(nextOrders)
      setLoaded(true)
      setLoadError("")
    }, (message) => { setLoadError(message); setLoaded(true) })
  }, [])

  const markReady = useCallback(async (order) => {
    await updateStaffOrder(order.id, {
      orderStatus: "ready",
      readyAt: new Date().toISOString(),
      readyAtMs: Date.now(),
    })
    sendPushToCustomer(order.id)
  }, [])

  // Calculate real-time active order and item counts per station (received & preparing only)
  const stationCounts = useMemo(() => {
    const activeOrders = orders.filter((o) => STEPS.includes(o.orderStatus))

    let kitchenOrders = 0
    let baristaOrders = 0
    let kitchenItems = 0
    let baristaItems = 0

    activeOrders.forEach((order) => {
      const items = order.items || []
      const hasKitchen = items.some((i) => !isBaristaItem(i))
      const hasBarista = items.some((i) => isBaristaItem(i))

      if (hasKitchen) kitchenOrders++
      if (hasBarista) baristaOrders++

      items.forEach((item) => {
        const qty = Number(item.quantity) || 1
        if (isBaristaItem(item)) {
          baristaItems += qty
        } else {
          kitchenItems += qty
        }
      })
    })

    return {
      allOrders: activeOrders.length,
      allItems: kitchenItems + baristaItems,
      kitchenOrders,
      kitchenItems,
      baristaOrders,
      baristaItems,
    }
  }, [orders])

  // Active Category breakdown in real time
  const activeCategoryCounts = useMemo(() => {
    const activeOrders = orders.filter((o) => STEPS.includes(o.orderStatus))
    const counts = {}
    activeOrders.forEach((order) => {
      ;(order.items || []).forEach((item) => {
        const catName = item.category || (isBaristaItem(item) ? "Drinks" : "Food")
        const qty = Number(item.quantity) || 1
        counts[catName] = (counts[catName] || 0) + qty
      })
    })
    return counts
  }, [orders])

  // Filter columns by active steps and station selection
  // The queue is worked out over all open orders, then filtered by station for display.
  const queue = useKitchenQueue(orders, cafeSlug)
  const columns = useMemo(() => {
    const inQueue = orders
      .filter((o) => queue.has(o.id) && matchesStation(o, stationFilter))
      .sort((a, b) => queue.get(a.id).position - queue.get(b.id).position)
    return {
      preparing: inQueue.filter((o) => queue.get(o.id).preparing),
      received: inQueue.filter((o) => !queue.get(o.id).preparing),
    }
  }, [orders, queue, stationFilter])

  const totalActiveOrders = columns.received.length + columns.preparing.length

  const scrollToCol = useCallback((key) => {
    if (!kanbanRef.current) return
    const children = kanbanRef.current.children
    const idx = TABS.findIndex((t) => t.key === key)
    const child = children[idx]
    if (child) child.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })
    setActiveTab(key)
  }, [])

  const handleKanbanScroll = useCallback(() => {
    if (!kanbanRef.current) return
    const { scrollLeft, clientWidth } = kanbanRef.current
    if (clientWidth === 0) return
    const idx = Math.round(scrollLeft / clientWidth)
    const tab = TABS[idx]
    if (tab && tab.key !== activeTabRef.current) setActiveTab(tab.key)
  }, [])

  return (
    <div className="kds-root">
      {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
      {/* Top Navigation & Controls */}
      {soundBlocked && !isMuted ? (
        <button type="button" className="kds-sound-banner" onClick={() => unlockSound().then((ok) => setSoundBlocked(!ok))}>
          <Volume2 size={18} /> Tap to turn on the new-order sound
        </button>
      ) : null}
      <header className="kds-header">
        <div className="kds-header-left">
          <ChefHat size={28} className="kds-title-icon" />
          <h1 className="kds-title">Kitchen KDS</h1>
          <span className="kds-count-badge">
            {totalActiveOrders} Active Orders ({stationCounts.allItems} items)
          </span>
        </div>

        <div className="kds-header-actions">
          <button
            type="button"
            className={`kds-header-btn ${isMuted ? "kds-btn-muted" : ""}`}
            onClick={toggleMute}
            title={isMuted ? "Unmute notification chime" : "Mute notification chime"}
            aria-label="Toggle Sound"
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <Link to={`/${cafeSlug}/kds/settings`} className="kds-header-btn" aria-label="Settings">
            <Settings size={20} />
          </Link>
        </div>
      </header>

      {/* Real-time Station Selector & Category Counters */}
      <div className="kds-station-bar">
        <div className="kds-station-pills" role="tablist" aria-label="Select Station">
          {STATIONS.map((st) => {
            const Icon = st.icon
            const isActive = stationFilter === st.key
            const countVal =
              st.key === "kitchen"
                ? stationCounts.kitchenItems
                : st.key === "barista"
                ? stationCounts.baristaItems
                : stationCounts.allItems

            return (
              <button
                key={st.key}
                type="button"
                className={`kds-station-pill ${isActive ? "kds-station-active" : ""}`}
                onClick={() => setStationFilter(st.key)}
                role="tab"
                aria-selected={isActive}
              >
                <Icon size={16} />
                <span>{st.label}</span>
                <span className="kds-pill-badge" title="Real-time active items">
                  {countVal}
                </span>
              </button>
            )
          })}
        </div>

        {/* Real-time Category Breakdown Chips */}
        {Object.keys(activeCategoryCounts).length > 0 && (
          <div className="kds-category-chips">
            {Object.entries(activeCategoryCounts).map(([catName, catCount]) => (
              <span key={catName} className="kds-cat-chip">
                {catName}: <strong>{catCount}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mobile Kanban Tabs */}
      <div className="kds-mobile-tabs" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const count = columns[tab.key]?.length || 0
          return (
            <button
              key={tab.key}
              className={`kds-tab ${activeTab === tab.key ? "kds-tab-active" : ""}`}
              onClick={() => scrollToCol(tab.key)}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
              {count > 0 && <span className="kds-tab-count">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Main Order Columns */}
      <div className="kds-kanban" ref={kanbanRef} onScroll={handleKanbanScroll}>
        {TABS.map((tab) => {
          const items = columns[tab.key]
          return (
            <div key={tab.key} className="kds-col" data-status={tab.key} role="tabpanel">
              <div className="kds-col-header">
                <h2>{tab.label}</h2>
                <span className="kds-col-count">{items.length}</span>
              </div>

              <div className="kds-col-body">
                {!loaded ? (
                  <>
                    <TicketSkeleton />
                    <TicketSkeleton />
                  </>
                ) : items.length === 0 ? (
                  <EmptyState status={tab.key} station={stationFilter} />
                ) : (
                  items.map((order, idx) => {
                    const sinceMs = orderCreatedMs(order)

                    return (
                      <article
                        key={order.id}
                        className={`kds-ticket ${
                          order.priority === "urgent" || order.priority === "high"
                            ? "kds-ticket-high-priority"
                            : ""
                        }`}
                        style={{ animationDelay: `${idx * 40}ms` }}
                        tabIndex={0}
                      >
                        <div className="kds-ticket-head">
                          <div className="kds-ticket-meta">
                            <span className="kds-ticket-table">
                              Table {order.tableNumber || "Takeout"}
                            </span>
                            {order.id && (
                              <span className="kds-ticket-id">#{String(order.id).slice(-5)}</span>
                            )}
                          </div>
                          {(order.priority === "urgent" || order.priority === "high") && (
                            <span className="kds-ticket-priority">URGENT</span>
                          )}
                        </div>

                        <TicketTimer sinceMs={sinceMs} />
                        {tab.key === "received" ? <span className="kds-ticket-id">#{queue.get(order.id).position + 1} in line</span> : null}

                        <ul className="kds-ticket-items">
                          {(order.items || []).map((item, i) => {
                            const isBarista = isBaristaItem(item)
                            const isDimmed =
                              (stationFilter === "kitchen" && isBarista) ||
                              (stationFilter === "barista" && !isBarista)

                            return (
                              <li
                                key={i}
                                className={`kds-ticket-item ${isDimmed ? "kds-item-dimmed" : ""}`}
                              >
                                <span className="kds-ticket-qty">{item.quantity || 1}x</span>
                                <div className="kds-ticket-info">
                                  <div className="kds-item-title-row">
                                    <span className="kds-ticket-name">{item.name}</span>
                                    {isBarista ? (
                                      <span className="kds-station-tag barista" title="Barista Drink">
                                        <Coffee size={11} /> Barista
                                      </span>
                                    ) : (
                                      <span className="kds-station-tag kitchen" title="Kitchen Dish">
                                        <Utensils size={11} /> Kitchen
                                      </span>
                                    )}
                                    {item.calories != null ? (
                                      <span className="kds-ticket-cal">{item.calories} kcal</span>
                                    ) : null}
                                  </div>

                                  {item.notes && (
                                    <span className="kds-ticket-note">
                                      <AlertTriangle size={12} /> {item.notes}
                                    </span>
                                  )}
                                  {formatIngredientSelections(item, "Ingredients", "Removed") && (
                                    <span className="kds-ticket-sub">
                                      {formatIngredientSelections(item, "Ingredients", "Removed")}
                                    </span>
                                  )}
                                  {formatCustomizations(item.customizations) && (
                                    <span className="kds-ticket-sub">
                                      {formatCustomizations(item.customizations)}
                                    </span>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>

                        <div className="kds-ticket-actions">
                          <button
                            className="kds-btn kds-btn-green"
                            type="button"
                            onClick={() => markReady(order).catch(() => setLoadError("Could not mark this order done. Please retry."))}
                          >
                            <CheckCircle2 size={18} /> Done
                          </button>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
