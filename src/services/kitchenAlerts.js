// Kitchen screen alerts: a generated beep (no audio file) and new-order detection.
let audioContext = null

export function soundReady() {
  return audioContext?.state === "running"
}

// Browsers only allow sound after a tap; call this from a tap/click handler.
export async function unlockSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return false
    audioContext ||= new AudioCtx()
    await audioContext.resume()
  } catch {
    return false
  }
  return soundReady()
}

// Two short tones, loud enough for a busy kitchen.
export function beep() {
  if (!soundReady()) return false
  const start = audioContext.currentTime
  ;[0, 0.25].forEach((offset, i) => {
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.frequency.value = i ? 1320 : 880
    gain.gain.setValueAtTime(0.4, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.2)
    osc.connect(gain).connect(audioContext.destination)
    osc.start(start + offset)
    osc.stop(start + offset + 0.2)
  })
  return true
}

// IDs of "received" orders that were not in the previous feed.
export function newOrderIds(previousIds, orders) {
  return orders.filter((o) => o.orderStatus === "received" && !previousIds.has(o.id)).map((o) => o.id)
}

// A paid order closes the moment it is ready, so "paid" with a ready time also means ready.
export function isOrderReady(order) {
  return order?.orderStatus === "ready" || (order?.orderStatus === "paid" && Boolean(order.readyAtMs || order.readyAt))
}
