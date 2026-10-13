import { DistributionChart } from "../components/PlatformCharts"
import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Download, Activity, Search } from "lucide-react"
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

  return (
    <div className="admin-stack audit-page">
      <div className="admin-head audit-page-head">
        <div>
          <p className="eyebrow">Data & History</p>
          <h2>{isPlatform ? "Platform Audit Logs" : "Reports & Audit Logs"}</h2>
        </div>
        {!isPlatform && <div className="two-col" style={{ maxWidth: 260 }}>
          <button
            className={activeTab === "reports" ? "primary-button" : "ghost-button"}
            type="button"
            onClick={() => setActiveTab("reports")}
          >
            Reports
          </button>
          <button
            className={activeTab === "audit" ? "primary-button" : "ghost-button"}
            type="button"
            onClick={() => setActiveTab("audit")}
          >
            <Activity size={16} /> Audit Log
          </button>
        </div>}
      </div>

      {loadError ? <p className="form-error">{loadError}</p> : null}

      {isPlatform && !loadError && auditLogs.length > 0 && <DistributionChart title="Recent activity by area" description="Distribution of the loaded audit entries, before search filtering" items={[
        { label: "Access & subscriptions", value: auditLogs.filter(log => String(log.action).startsWith("subscription.")).length },
        { label: "Cafe management", value: auditLogs.filter(log => String(log.action).startsWith("cafe.")).length },
        { label: "Accounts & sign-ins", value: auditLogs.filter(log => /^(auth|user)\./.test(String(log.action))).length },
        { label: "Other activity", value: auditLogs.filter(log => !/^(subscription|cafe|auth|user)\./.test(String(log.action))).length },
      ]} />}

      {activeTab === "reports" ? (
        <>
          <section className="admin-panel">
            <div className="audit-section-head">
              <div>
                <p className="eyebrow">Sales reporting</p>
                <h2>Reports</h2>
                <p className="admin-hint">Completed orders preserved for reporting and analytics.</p>
              </div>
              <button className="primary-button" type="button" onClick={() => downloadCsv(report, rangeLabel)} disabled={!report.completedOrders.length}>
                <Download size={18} />
                Export CSV
              </button>
            </div>
            <div className="admin-filter-bar audit-filter-bar">
              <label className="field">
                <span>Report</span>
                <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
                  {REPORT_TYPES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Search history</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Table, item, order ID..." />
              </label>
              {reportType === "custom" ? (
                <>
                  <label className="field">
                    <span>From</span>
                    <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>To</span>
                    <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                  </label>
                </>
              ) : null}
            </div>
          </section>

          <section className="audit-summary-grid">
            <article>
              <span>Completed orders</span>
              <strong>{report.totalOrders}</strong>
            </article>
            <article>
              <span>Total revenue</span>
              <strong>{money(report.totalRevenue)}</strong>
            </article>
            <article>
              <span>Average order value</span>
              <strong>{money(report.averageOrderValue)}</strong>
            </article>
            <article>
              <span>Report range</span>
              <strong>{rangeLabel}</strong>
            </article>
          </section>

          <section className="report-breakdown-grid">
            <article className="audit-table-card">
              <h3>Most ordered items</h3>
              {report.itemCounts.length ? report.itemCounts.slice(0, 8).map(([name, data]) => (
                <div className="report-row" key={name}>
                  <span>{name}</span>
                  <strong>{data.count}</strong>
                </div>
              )) : <div className="empty-state">No item sales in this range.</div>}
            </article>
            <article className="audit-table-card">
              <h3>Orders by table</h3>
              {report.tableCounts.length ? report.tableCounts.slice(0, 8).map(([table, count]) => (
                <div className="report-row" key={table}>
                  <span>Table {table}</span>
                  <strong>{count}</strong>
                </div>
              )) : <div className="empty-state">No table history in this range.</div>}
            </article>
          </section>

          <section className="audit-table-card">
            {report.completedOrders.length ? (
              <div className="audit-table" role="table">
                <div className="audit-row audit-row-head sales-row" role="row">
                  <span>Completed</span>
                  <span>Table</span>
                  <span>Items</span>
                  <span>Total</span>
                </div>
                {report.completedOrders.map((order) => (
                  <div className="audit-row sales-row" role="row" key={order.id}>
                    <span>{formatDateTime(orderCompletedAt(order))}</span>
                    <strong>Table {order.tableNumber}</strong>
                    <span>{orderItems(order)}</span>
                    <strong>{money(order.totalAmount)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No completed orders match this report.</div>
            )}
          </section>
        </>
      ) : null}

      {activeTab === "audit" ? (
        <section className="audit-table-card">
          <div style={{ padding: "14px 14px 0" }}>
            <div className="audit-section-head" style={{ marginBottom: 8 }}>
              <h3>Activity History</h3>
              <span className="admin-hint">{auditLogs.length} entries</span>
            </div>
            <div className="input-with-icon">
              <Search size={16} />
              <input
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search action, actor, or description..."
              />
            </div>
          </div>
          {filteredAuditLogs.length === 0 ? (
            <div className="empty-state" style={{ margin: 14 }}>No audit logs found.</div>
          ) : (
            <div className="audit-table">
              <div className="audit-row audit-row-head">
                <span>Action</span>
                <span>Actor</span>
                <span>Time</span>
              </div>
              {filteredAuditLogs.map((log) => (
                <div className="audit-row" key={log.id}>
                  <span>{formatAuditAction(log)}</span>
                  <span>{log.actor || "system"}</span>
                  <span style={{ color: "#8b9692", fontSize: "0.86rem" }}>{formatTime(log.createdAtMs ? new Date(log.createdAtMs) : log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
