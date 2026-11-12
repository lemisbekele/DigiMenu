import { Link, useSearchParams } from "react-router-dom"
import { Inbox, CreditCard } from "lucide-react"
import { SuperAdminRequests } from "./SuperAdminRequests"
import { SubscriptionAssignments } from "../components/SubscriptionAssignments"

export function SuperAdminAccess() {
  const [params] = useSearchParams()
  const history = params.get("view") === "subscriptions"
  return <div className="ui-stack">
    <div className="ui-page-header"><h1>Access &amp; subscriptions</h1><p>Review new cafe requests and manage existing subscription access in one place.</p></div>
    <nav className="ui-seg" aria-label="Access workspace">
      <Link to="/superadmin/requests" className={!history ? "is-active" : ""} aria-current={!history ? "page" : undefined}><Inbox size={18} />Pending requests</Link>
      <Link to="/superadmin/requests?view=subscriptions" className={history ? "is-active" : ""} aria-current={history ? "page" : undefined}><CreditCard size={18} />Subscriptions &amp; history</Link>
    </nav>
    {history ? <SubscriptionAssignments /> : <SuperAdminRequests />}
  </div>
}
