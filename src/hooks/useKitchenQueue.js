import { useEffect, useMemo, useState } from "react"
import { fetchKitchenCapacity } from "../services/dataService"
import { DEFAULT_KITCHEN_CAPACITY, kitchenQueue } from "../services/kitchenQueue"

// Queue positions for the given orders, using this cafe's "orders in progress at once" setting.
export function useKitchenQueue(orders, cafeSlug) {
  const [capacity, setCapacity] = useState(DEFAULT_KITCHEN_CAPACITY)
  useEffect(() => { fetchKitchenCapacity(cafeSlug).then(setCapacity).catch(() => {}) }, [cafeSlug])
  return useMemo(() => kitchenQueue(orders, capacity), [orders, capacity])
}
