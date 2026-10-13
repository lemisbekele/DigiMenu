import { useEffect, useState } from "react"
import { observeSubscriptionRequests } from "../services/subscriptionService"

export const observeAllSubscriptions = (callback, onError) => observeSubscriptionRequests(callback, null, onError)
export const observePendingRequests = (callback, onError) => observeSubscriptionRequests(callback, "pending_approval", onError)

// A failed feed must be distinguishable from a successful empty result.
export function usePlatformFeed(observe) {
  const [state, setState] = useState({ data: [], loading: true, error: false })
  useEffect(() => observe(
    data => setState({ data: data || [], loading: false, error: false }),
    () => setState({ data: [], loading: false, error: true }),
  ), [observe])
  return state
}
