import { DistributionChart } from "../components/PlatformCharts"
import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Download, Search } from "lucide-react"
import { DataTable, EmptyState, PageHeader, StatCard } from "../ui"
import "./staff-layout.css"
import { useAuth } from "../context/authContextValue"
import { money, observeOrders, observeAuditLogs } from "../services/dataService"
import { buildReport, buildSalesCsv, orderCompletedAt, orderItems, reportRange, REPORT_TYPES } from "../services/reporting"

function downloadCsv(report, rangeLabel) {
  const csv = buildSalesCsv(report, rangeLabel)
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `digimenu-sales-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function formatAuditAction(log) {
  if (!log || !log.action) return "Activity recorded"
  const d = log.details || {}
  const map = {
    "auth.login": "Logged in",
    "auth.logout": "Logged out",
    "order.payment.processed": `Payment processed for Table ${d.tableNumber || ""}`,
    "order.update": `Order #${(d.id || "").slice(0, 8)} updated`,
    "order.paymentProof.upload": `Payment proof uploaded for order #${(d.id || "").slice(0, 8)}`,
    "menuItem.create": `Menu item "${d.name || ""}" created`,
    "menuItem.update": `Menu item "${d.name || ""}" updated`,
    "menuItem.delete": `Menu item "${d.name || ""}" deleted`,
    "menuItem.availability": `"${d.name || ""}" marked ${d.available ? "available" : "unavailable"}`,
    "table.create": `Table ${d.tableNumber || ""} added`,
    "table.update": `Table ${d.tableNumber || ""} updated`,
    "table.delete": `Table ${d.tableNumber || ""} removed`,
    "paymentOption.create": `Payment method "${d.name || ""}" added`,
    "paymentOption.update": `Payment method "${d.name || ""}" updated`,
    "paymentOption.delete": `Payment method "${d.name || ""}" removed`,
    "settings.billing.update": "Billing settings updated",
    "user.create": `User "${d.email || ""}" created`,
  }
  return map[log.action] || String(log.action).replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatTime(date) {
  if (!date) return ""
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  return formatDateTime(d)
}

export function AdminAuditLogs() {
  const { role } = useAuth()
  const isPlatform = role === "superadmin"
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loadError, setLoadError] = useState("")
  const [reportType, setReportType] = useState("daily")
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [auditSearch, setAuditSearch] = useState("")
  const [activeTab, setActiveTab] = useState(isPlatform || searchParams.get("tab") === "audit" ? "audit" : "reports")

  useEffect(() => { if (!isPlatform) return observeOrders(setOrders, setLoadError) }, [isPlatform])
  useEffect(() => { return observeAuditLogs((logs) => setAuditLogs(logs || []), setLoadError) }, [])

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (isPlatform) setActiveTab("audit")
    else if (tab === "reports" || tab === "audit") setActiveTab(tab)
  }, [searchParams, isPlatform])

  const range = useMemo(() => reportRange(reportType, from, to), [from, reportType, to])
  const report = useMemo(() => buildReport(orders, range, search), [orders, range, search])
  const rangeLabel = `${formatDateTime(range.from, { timeStyle: undefined })} - ${formatDateTime(new Date(range.to.getTime() - 1), { timeStyle: undefined })}`
  const [rangeFrom, rangeTo] = rangeLabel.split(" - ")
  const rangeText = rangeFrom === rangeTo ? rangeFrom : rangeLabel

  const filteredAuditLogs = useMemo(() => {
    if (!auditSearch) return auditLogs
    const q = auditSearch.toLowerCase().trim()
    return auditLogs.filter(
      (log) =>
        (log.action || "").toLowerCase().includes(q) ||
        (log.actor || "").toLowerCase().includes(q) ||
        formatAuditAction(log).toLowerCase().includes(q),
    )
  }, [auditLogs, auditSearch])

  const salesColumns = [
    { key: "completed", label: "Completed", render: (order) => formatDateTime(orderCompletedAt(order)) },
    { key: "table", label: "Table", render: (order) => <strong>Table {order.tableNumber}</strong> },
    { key: "items", label: "Items", render: (order) => <span title={orderItems(order)}>{orderItems(order)}</span> },
    { key: "total", label: "Total", align: "right", render: (order) => money(order.totalAmount) },
  ]
  const auditColumns = [
    { key: "action", label: "Action", render: (log) => <span title={formatAuditAction(log)}>{formatAuditAction(log)}</span> },
    { key: "actor", label: "Actor", render: (log) => log.actor || "system" },
    { key: "time", label: "Time", render: (log) => <span className="ui-muted">{formatTime(log.createdAtMs ? new Date(log.createdAtMs) : log.createdAt)}</span> },
  ]

  return (
    <div className="ui-stack">
      <PageHeader
        title={isPlatform ? "Audit logs" : "Reports"}
        subtitle={isPlatform ? "Everything that changed on the platform" : "Sales reports and the activity history"}
        action={!isPlatform && activeTab === "reports" ? (
          <button className="ui-btn ui-btn--primary" type="button" onClick={() => downloadCsv(report, rangeLabel)} disabled={!report.completedOrders.length}>
            <Download size={16} /> Export CSV
          </button>
        ) : null}
      />

      {!isPlatform ? (
        <div className="ui-toolbar">
          <div className="ui-seg">
            <button type="button" aria-pressed={activeTab === "reports"} onClick={() => setActiveTab("reports")}>Reports</button>
            <button type="button" aria-pressed={activeTab === "audit"} onClick={() => setActiveTab("audit")}>Audit log</button>
          </div>
        </div>
      ) : null}

      {loadError ? <p className="ui-error">{loadError}</p> : null}

      {isPlatform && !loadError && auditLogs.length > 0 && <DistributionChart title="Recent activity by area" description="Distribution of the loaded audit entries, before search filtering" items={[
        { label: "Access & subscriptions", value: auditLogs.filter(log => String(log.action).startsWith("subscription.")).length },
        { label: "Cafe management", value: auditLogs.filter(log => String(log.action).startsWith("cafe.")).length },
        { label: "Accounts & sign-ins", value: auditLogs.filter(log => /^(auth|user)\./.test(String(log.action))).length },
        { label: "Other activity", value: auditLogs.filter(log => !/^(subscription|cafe|auth|user)\./.test(String(log.action))).length },
      ]} />}

      {activeTab === "reports" ? (
        <>
          <div className="ui-form-row">
            <label className="ui-field">
              Report
              <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
                {REPORT_TYPES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </label>
            <label className="ui-field">
              Search history
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Table, item, order ID..." />
            </label>
            {reportType === "custom" ? (
              <>
                <label className="ui-field">
                  From
                  <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                </label>
                <label className="ui-field">
                  To
                  <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </label>
              </>
            ) : null}
          </div>

          <div className="ui-stats">
            <StatCard label="Completed orders" value={report.totalOrders} />
            <StatCard label="Total revenue" value={money(report.totalRevenue)} />
            <StatCard label="Average order value" value={money(report.averageOrderValue)} />
            <StatCard label="Report range" value={rangeText} />
          </div>

          <div className="ui-grid report-breakdown">
            <section className="ui-card ui-card--stack">
              <div className="ui-section-head"><h2>Most ordered items</h2></div>
              {report.itemCounts.length ? (
                <ul className="ui-lines">
                  {report.itemCounts.slice(0, 8).map(([name, data]) => (
                    <li className="ui-line" key={name}><span className="ui-truncate">{name}</span><strong className="ui-num">{data.count}</strong></li>
                  ))}
                </ul>
              ) : <EmptyState title="No item sales in this range" />}
            </section>
            <section className="ui-card ui-card--stack">
              <div className="ui-section-head"><h2>Orders by table</h2></div>
              {report.tableCounts.length ? (
                <ul className="ui-lines">
                  {report.tableCounts.slice(0, 8).map(([table, count]) => (
                    <li className="ui-line" key={table}><span>Table {table}</span><strong className="ui-num">{count}</strong></li>
                  ))}
                </ul>
              ) : <EmptyState title="No table history in this range" />}
            </section>
          </div>

          <DataTable columns={salesColumns} rows={report.completedOrders} rowKey="id" empty={{ title: "No completed orders match this report", body: "Try another report type or clear the search." }} />
        </>
      ) : null}

      {activeTab === "audit" ? (
        <>
          <div className="ui-toolbar">
            <span className="ui-muted">{auditLogs.length} entries</span>
            <div className="ui-search">
              <Search size={16} />
              <input value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} placeholder="Search action, actor or description" aria-label="Search the audit log" />
            </div>
          </div>
          <DataTable columns={auditColumns} rows={filteredAuditLogs} rowKey="id" empty={{ title: "No audit entries found", body: auditSearch ? "Try a different search." : "Activity appears here as people use the app." }} />
        </>
      ) : null}
    </div>
  )
}
