import { toUserMessage } from "./userMessages"

const MAX_EVENTS = 50

function eventStore() {
  try {
    return JSON.parse(sessionStorage.getItem("digimenu-monitoring") || "[]")
  } catch {
    return []
  }
}

export function logClientEvent(type, details = {}) {
  const event = {
    details,
    timestamp: new Date().toISOString(),
    type,
  }
  try {
    const events = [event, ...eventStore()].slice(0, MAX_EVENTS)
    sessionStorage.setItem("digimenu-monitoring", JSON.stringify(events))
  } catch {
    // Monitoring should never interrupt the app.
  }
}

export function friendlyErrorMessage(message = "") {
  return toUserMessage(message)
}

