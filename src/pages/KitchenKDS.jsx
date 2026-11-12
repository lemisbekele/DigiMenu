import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, ChefHat, Coffee, Settings, Utensils, Volume2, VolumeX } from "lucide-react"
import { Link } from "react-router-dom"
import { useCafeSlug } from "../hooks/useCafeSlug"
import { useKitchenQueue } from "../hooks/useKitchenQueue"
import { beep, newOrderIds, soundReady, unlockSound } from "../services/kitchenAlerts"
import { isDrink, pendingStations, stationItems } from "../services/kitchenQueue"
import { useAuth } from "../context/authContextValue"
import {
  itemChanges,
  markStationDone,
  observeOrders,
  sendPushToCustomer,
  updateStaffOrder,
} from "../services/dataService"
import "./service-layout.css"

// Kitchen display: the oldest N open orders are "Preparing", the rest wait "In line".
// Design: large tickets, big table numbers, wait time in color, one Done button (docs/design-guide.md).
const COLUMNS = [
  { key: "preparing", label: "Preparing", empty: "Nothing on the stove" },
  { key: "waiting", label: "In line", empty: "Nobody waiting" },
]

const STATIONS = [
  { key: "all", label: "All" },
  { key: "food", label: "Food" },
  { key: "drinks", label: "Drinks" },
]

function orderCreatedMs(order) {
  return Number(order.createdAtMs) || new Date(order.createdAt || Date.now()).getTime()
}

// Wait time in minutes:seconds, and how late it is (ok < 5 min, warn < 10 min, late after).
function waitInfo(order, now) {
  const secs = Math.max(0, Math.floor((now - orderCreatedMs(order)) / 1000))
  const level = secs > 600 ? "late" : secs > 300 ? "warn" : "ok"
  return { label: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, level }
}

function Ticket({ order, now, position, station, onDone, primary }) {
  const [busy, setBusy] = useState(false)
  const wait = waitInfo(order, now)
  const urgent = order.priority === "urgent" || order.priority === "high"
  return (
    <article className="ui-card ui-ticket">
      <header className="ui-ticket-head ui-tint" data-tone={wait.level === "late" ? "late" : position == null ? "preparing" : "waiting"}>
        <span>{wait.level === "late" ? "Late" : position == null ? "Preparing" : "In line"}</span>
        <span aria-label={`Waiting ${wait.label}`}>{wait.label}</span>
      </header>
      <div className="ui-ticket-body">
      <div className="ui-ticket-no">Table {order.tableNumber || "—"}</div>
      {position != null || urgent ? (
        <p className="kq-ticket-meta">
          {position != null ? <span>#{position + 1} in line</span> : null}
          {urgent ? <span className="kq-urgent">Urgent</span> : null}
        </p>
      ) : null}
      <ul className="ui-ticket-items kq-items">
        {stationItems(order, station).map((item, i) => {
          const drink = isDrink(item)
          const extras = itemChanges(item)
          return (
            <li key={i}>
              <span className="kq-qty">{item.quantity || 1}×</span>
              <div className="kq-item">
                <span className="kq-name">
                  {item.name}
                  {drink ? <Coffee size={14} aria-label="Drink" /> : <Utensils size={14} aria-label="Food" />}
                </span>
                {item.notes ? <span className="kq-note"><AlertTriangle size={14} /> {item.notes}</span> : null}
                {extras.map((text) => <span key={text} className="kq-extra">{text}</span>)}
              </div>
            </li>
          )
        })}
      </ul>
      </div>
      <div className="ui-ticket-foot">
      <button
        type="button"
        className={primary ? "ui-btn ui-btn--block ui-btn--primary" : "ui-btn ui-btn--block"}
        disabled={busy}
        onClick={() => { setBusy(true); onDone(order).finally(() => setBusy(false)) }}
      >
        <CheckCircle2 size={16} /> Done
      </button>
      </div>
    </article>
  )
}

export function KitchenKDS() {
  const cafeSlug = useCafeSlug()
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [mobileColumn, setMobileColumn] = useState("preparing")
  // A kitchen account with a station (set on the Team page) only ever sees that station's work.
  const myStation = useAuth().roleData?.station || null
  const [pickedStation, setStation] = useState("all")
  const station = myStation || pickedStation
  const [now, setNow] = useState(Date.now)
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("kds_muted") === "true")
  const [soundBlocked, setSoundBlocked] = useState(true)
  const previousIds = useRef(null)
  const isMutedRef = useRef(isMuted)
  isMutedRef.current = isMuted

  // One clock for all ticket timers.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

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

  const toggleMute = () => {
    setIsMuted((prev) => {
      localStorage.setItem("kds_muted", String(!prev))
      return !prev
    })
  }

  const markDone = useCallback(async (order) => {
    try {
      // On a station screen, the order is ready only once every station in it is done.
      if (station !== "all") {
        const doneStations = await markStationDone(order.id, station)
        if (pendingStations({ ...order, doneStations }).length) return
      }
      await updateStaffOrder(order.id, { orderStatus: "ready", readyAt: new Date().toISOString(), readyAtMs: Date.now() })
      sendPushToCustomer(order.id)
    } catch (err) {
      setLoadError(`Could not mark this order done: ${err?.message || "please retry."}`)
    }
  }, [station])

  // The queue is worked out over all open orders, then filtered by station for display.
  const queue = useKitchenQueue(orders, cafeSlug)
  const { columns, stationCounts } = useMemo(() => {
    const open = orders.filter((o) => queue.has(o.id)).sort((a, b) => queue.get(a.id).position - queue.get(b.id).position)
    const forStation = (o, s) => s === "all" || pendingStations(o).includes(s)
    const shown = open.filter((o) => forStation(o, station))
    return {
      columns: {
        preparing: shown.filter((o) => queue.get(o.id).preparing),
        waiting: shown.filter((o) => !queue.get(o.id).preparing),
      },
      stationCounts: Object.fromEntries(STATIONS.map((s) => [s.key, open.filter((o) => forStation(o, s.key)).length])),
    }
  }, [orders, queue, station])

  return (
    <div className="ui-stack ui-touch kq">
      {soundBlocked && !isMuted ? (
        <button type="button" className="kq-sound-banner" onClick={() => unlockSound().then((ok) => setSoundBlocked(!ok))}>
          <Volume2 size={18} /> Tap to turn on the new-order sound
        </button>
      ) : null}
      {loadError ? <p className="ui-error" role="alert">{loadError}</p> : null}

      <header className="ui-page-header kq-bar">
        <div className="ui-page-header-text">
          <h1>{myStation === "drinks" ? "Drinks" : myStation === "food" ? "Food" : "Kitchen"}</h1>
          <p>{columns.preparing.length} preparing · {columns.waiting.length} in line</p>
        </div>
        <div className="ui-seg" role="group" aria-label="Show" hidden={Boolean(myStation)}>
          {STATIONS.map((s) => (
            <button key={s.key} type="button" aria-pressed={station === s.key} onClick={() => setStation(s.key)}>
              {s.label} <span className="kq-count">{stationCounts[s.key]}</span>
            </button>
          ))}
        </div>
        <div className="kq-icons">
          <button type="button" className="ui-btn ui-btn--icon" onClick={toggleMute} aria-label={isMuted ? "Turn sound on" : "Turn sound off"} title={isMuted ? "Sound off" : "Sound on"}>
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <Link to={`/${cafeSlug}/kds/settings`} className="ui-btn ui-btn--icon" aria-label="Kitchen settings" title="Settings">
            <Settings size={20} />
          </Link>
        </div>
      </header>

      <div className="ui-seg kq-mobile-switch" role="tablist">
        {COLUMNS.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={mobileColumn === c.key} onClick={() => setMobileColumn(c.key)}>
            {c.label} <span className="kq-count">{columns[c.key].length}</span>
          </button>
        ))}
      </div>

      <main className="kq-board" data-mobile={mobileColumn}>
        {COLUMNS.map((c) => (
          <section key={c.key} className="kq-col" data-col={c.key} aria-label={c.label}>
            <h2>{c.label} <span className="kq-count">{columns[c.key].length}</span></h2>
            {!loaded ? (
              <div className="ui-card kq-skeleton" aria-hidden="true" />
            ) : columns[c.key].length === 0 ? (
              <div className="ui-empty"><ChefHat size={28} strokeWidth={1.5} /><strong>{c.empty}</strong></div>
            ) : (
              <div className="kq-tickets">
                {columns[c.key].map((order, index) => (
                  <Ticket
                    primary={c.key === "preparing" && index === 0}
                    key={order.id}
                    order={order}
                    now={now}
                    station={station}
                    position={c.key === "waiting" ? queue.get(order.id).position : null}
                    onDone={markDone}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  )
}
