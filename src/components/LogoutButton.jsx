import { LogOut } from "lucide-react"
import { useAuth } from "../context/authContextValue"

export function LogoutButton() {
  const { logout } = useAuth()

  return (
    <button className="danger-button" type="button" onClick={logout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
      <LogOut size={16} /> Sign out
    </button>
  )
}
