import { useParams } from "react-router-dom"
import { useAuth } from "../context/authContextValue"

export function useCafeSlug() {
  const { cafeSlug: routeCafeSlug } = useParams()
  const { cafeSlug: authCafeSlug } = useAuth()
  return String(routeCafeSlug || authCafeSlug || "").toLowerCase()
}
