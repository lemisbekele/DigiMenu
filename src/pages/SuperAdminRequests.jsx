import { toUserMessage } from "../services/userMessages"
import { formatDateTime } from "../services/regionalSettings"
import { useEffect, useMemo, useState } from "react"
import {
  Inbox, CheckCircle2, XCircle, Search, Copy, Check, ShieldCheck, Phone, FileText, KeyRound,
} from "lucide-react"
import { useRBAC } from "../context/rbacContextValue"
import { ROLES } from "../services/roleService"
import {
  observeSubscriptionRequests,
  approveSubscriptionRequest,
  rejectSubscriptionRequest,
  generateTemporaryPassword,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_LABELS,
} from "../services/subscriptionService"
import { observePackages } from "../services/packageService"
import "./superadmin.css"
import { VisualSummary, FeedState } from "../components/PlatformCharts"

const statusStyle = (status) => {
  switch (status) {
    case SUBSCRIPTION_STATUS.PENDING_APPROVAL:
      return { bg: "var(--warning-bg)", color: "var(--warning)" }
    case SUBSCRIPTION_STATUS.ACTIVE:
    case SUBSCRIPTION_STATUS.APPROVED:
      return { bg: "var(--success-bg)", color: "var(--brand-ink)" }
    case SUBSCRIPTION_STATUS.REJECTED:
      return { bg: "var(--danger-soft)", color: "var(--danger-text)" }
    case SUBSCRIPTION_STATUS.EXPIRED:
      return { bg: "var(--surface-2)", color: "var(--muted)" }
    default:
      return { bg: "var(--surface-2)", color: "var(--text-3)" }
  }
}

export function SuperAdminRequests() {
  const { role } = useRBAC()
  const isSuperAdmin = role === ROLES.SUPERADMIN || role === "superadmin"

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState("")
  const [credentialModal, setCredentialModal] = useState(null)
  const [approvalRequest, setApprovalRequest] = useState(null)
  const [temporaryPassword, setTemporaryPassword] = useState("")
  const [approvalError, setApprovalError] = useState("")
  const [actionError, setActionError] = useState("")
  const [copied, setCopied] = useState(false)
  const [successNotice, setSuccessNotice] = useState(null)

  useEffect(() => {
    return observeSubscriptionRequests(data => { setRequests(data); setLoading(false); setLoadError(false) }, SUBSCRIPTION_STATUS.PENDING_APPROVAL, () => { setLoading(false); setLoadError(true) })
  }, [])

  const [packagesList, setPackagesList] = useState([])
  useEffect(() => { return observePackages((data) => setPackagesList(data || []), () => {}) }, [])
  const packageById = useMemo(() => Object.fromEntries((packagesList || []).map((p) => [p.id, p])), [packagesList])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return requests.filter((r) => {
      const searchMatch = !q ||
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        (packageById[r.plan_key]?.name || "").toLowerCase().includes(q)
      return searchMatch
    })
  }, [requests, search, packageById])

  const handleApprove = (request) => {
    if (!isSuperAdmin) { setActionError("Only the platform owner can approve requests."); return }
    setApprovalRequest(request)
    setTemporaryPassword(generateTemporaryPassword())
    setApprovalError("")
  }

  const confirmApprove = async () => {
    if (!approvalRequest || busy) return
    const password = temporaryPassword.trim()
    if (password.length < 12) {
      setApprovalError("Temporary password must be at least 12 characters long.")
      return
    }
    if (!/[A-Z]/.test(password)) {
      setApprovalError("Temporary password must contain at least one uppercase letter.")
      return
    }
    if (!/[a-z]/.test(password)) {
      setApprovalError("Temporary password must contain at least one lowercase letter.")
      return
    }
    if (!/[0-9]/.test(password)) {
      setApprovalError("Temporary password must contain at least one number.")
      return
    }
    if (!/[!@#$%^&*]/.test(password)) {
      setApprovalError("Temporary password must contain at least one special character.")
      return
    }

    setApprovalError("")
    setBusy(approvalRequest.id)
    try {
      const res = await approveSubscriptionRequest(approvalRequest.id, password, role)
      setRequests((current) => current.filter((request) => request.id !== approvalRequest.id))
      setApprovalRequest(null)
      setTemporaryPassword("")
      setSuccessNotice({
        title: "Request approved successfully",
        message: `${approvalRequest.customer_name} was removed from pending requests.`,
      })
      setCredentialModal(res.credentials)
      window.setTimeout(() => setSuccessNotice(null), 5000)
    } catch (err) {
      setApprovalError(toUserMessage(err, "Failed to approve request."))
    } finally {
      setBusy("")
    }
  }

  const handleReject = async (reqId) => {
    if (!isSuperAdmin) { setActionError("Only the platform owner can reject requests."); return }
    const reason = window.prompt("Reason for declining this access request:", "Request declined by administrator.")
    if (reason === null) return
    setBusy(reqId)
    try {
      await rejectSubscriptionRequest(reqId, reason, role)
    } catch (err) {
      setActionError(toUserMessage(err, "Failed to reject request."))
    } finally {
      setBusy("")
    }
  }

  const handleCopy = () => {
    if (!credentialModal) return
    const text = `DigiMenu Admin Account Credentials:\nEmail: ${credentialModal.email}\nTemporary Password: ${credentialModal.temporaryPassword}\nCafe URL: /${credentialModal.cafeSlug}\nLogin Portal: ${window.location.origin}/${credentialModal.cafeSlug}/login`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  if (loading || loadError) return <FeedState loading={loading} error={loadError} />

  return (
    <div className="sa-page sa-requests-page">
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
      {successNotice ? (
        <div className="sa-success-toast" role="status" aria-live="polite">
          <CheckCircle2 size={20} />
          <div>
            <strong>{successNotice.title}</strong>
            <span>{successNotice.message}</span>
          </div>
          <button type="button" onClick={() => setSuccessNotice(null)} aria-label="Dismiss notification">Dismiss</button>
        </div>
      ) : null}
      <VisualSummary icon={Inbox} title={`${requests.length} requests awaiting review`}>Approve a request to provision its cafe and administrator account, or decline it with a reason.</VisualSummary>
      <div className="sa-page-toolbar">
        <div className="sa-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search pending requests" placeholder="Search by name, email, phone, or package..."
          />
        </div>
      </div>

      <section className="sa-panel-flush">
        {filtered.length === 0 ? (
          <div className="sa-empty">
            <Inbox size={32} />
            <div>No requests found.</div>
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Organization / Customer</th>
                  <th>Requested Package</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => {
                  const style = statusStyle(req.status)
                  const isPending = req.status === SUBSCRIPTION_STATUS.PENDING_APPROVAL
                  const plan = packageById[req.plan_key]
                  const isBusy = busy === req.id
                  return (
                    <tr key={req.id}>
                      <td data-label="Organization / Customer">
                        <strong style={{ color: "var(--brand-ink)", display: "block" }}>{req.customer_name}</strong>
                        <span style={{ color: "var(--text-3)", fontSize: "0.8rem", display: "block" }}>{req.email}</span>
                        {req.phone ? (
                          <span style={{ color: "var(--muted)", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4 }}>
                            <Phone size={12} /> {req.phone}
                          </span>
                        ) : null}
                        {req.notes ? (
                          <span style={{ color: "var(--muted)", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4 }}>
                            <FileText size={12} /> {req.notes}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Requested Package">
                        <span className="sa-package-tag">{plan?.name || req.plan_key}</span>
                      </td>
                      <td data-label="Submitted" style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>
                        {req.requested_at ? formatDateTime(req.requested_at, { timeStyle: undefined }) : "—"}
                      </td>
                      <td data-label="Status">
                        <span className="sa-badge" style={{ background: style.bg, color: style.color }}>
                          {SUBSCRIPTION_STATUS_LABELS[req.status] || req.status}
                        </span>
                        {req.rejection_reason ? (
                          <span style={{ display: "block", color: "var(--danger)", fontSize: "0.74rem", marginTop: 4 }}>Reason: {req.rejection_reason}</span>
                        ) : null}
                      </td>
                      <td data-label="Actions" style={{ textAlign: "right" }}>
                        {isPending ? (
                          <div className="sa-inline-actions">
                            <button
                              type="button"
                              onClick={() => handleApprove(req)}
                              disabled={isBusy}
                              className="primary-button"
                            >
                              <CheckCircle2 size={16} /> {isBusy ? "Approving..." : "Approve & Provision"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(req.id)}
                              disabled={isBusy}
                              className="danger-button"
                            >
                              <XCircle size={16} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {credentialModal ? (
        <div className="sa-modal-scrim">
          <div className="sa-modal" style={{ border: "1px solid rgba(52, 130, 27, 0.4)" }}>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--success-bg)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "0.75rem" }}>
                <ShieldCheck size={28} />
              </div>
              <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.3rem", color: "var(--brand-ink)" }}>Access Granted &amp; Account Provisioned</h2>
              <p style={{ color: "var(--text-3)", fontSize: "0.9rem", margin: 0 }}>
                One admin account was created for this customer. Share these temporary credentials.
              </p>
            </div>

            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginBottom: "1.5rem" }}>
              <div style={{ marginBottom: "0.75rem" }}>
                <span className="sa-fact-label">Admin Email</span>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--brand)", marginTop: 2 }}>{credentialModal.email}</div>
              </div>
              {credentialModal.cafeSlug ? (
                <div style={{ marginBottom: "0.75rem" }}>
                  <span className="sa-fact-label">Assigned Cafe URL</span>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--brand)", marginTop: 2 }}>/{credentialModal.cafeSlug}</div>
                </div>
              ) : null}
              <div>
                <span className="sa-fact-label">Temporary Password</span>
                <div style={{ fontSize: "1.1rem", fontFamily: "monospace", fontWeight: 800, color: "var(--warning)", marginTop: 2, letterSpacing: 1 }}>{credentialModal.temporaryPassword}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button type="button" onClick={handleCopy} className="ghost-button" style={{ flex: 1, justifyContent: "center" }}>
                {copied ? <Check size={18} style={{ color: "var(--brand)" }} /> : <Copy size={18} />}
                {copied ? "Copied!" : "Copy Credentials"}
              </button>
              <button type="button" onClick={() => setCredentialModal(null)} className="primary-button" style={{ flex: 1, justifyContent: "center" }}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approvalRequest ? (
        <div className="sa-modal-scrim">
          <form className="sa-modal sa-approval-modal" onSubmit={event => { event.preventDefault(); if (!busy) confirmApprove() }}>
            <div className="sa-modal-heading">
              <div className="sa-modal-icon sa-modal-icon-success"><KeyRound size={22} /></div>
              <div>
                <h2>Approve cafe request</h2>
                <p>Set the temporary password that {approvalRequest.email} will use for the first login.</p>
              </div>
            </div>
            <div className="form-context"><strong>{approvalRequest.customer_name}</strong><span>{approvalRequest.email}</span><span>Requested package: {approvalRequest.plan_key}</span></div>
            <p className="form-help">Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol (!@#$%^&amp;*). Share the temporary password securely after approval.</p>
            <label className="sa-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span className="sa-label" style={{ margin: 0 }}>Temporary password</span>
                <button
                  type="button"
                  className="sa-ghost"
                  style={{ fontSize: "0.78rem", padding: "2px 8px", height: "auto", cursor: "pointer" }}
                  onClick={() => setTemporaryPassword(generateTemporaryPassword())}
                >
                  Regenerate password
                </button>
              </div>
              <input
                className="sa-input"
                type="text" required minLength={12} autoComplete="off"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                placeholder="At least 12 characters, with upper/lowercase, number and symbol"
                autoFocus
              />
            </label>
            {approvalError ? <p className="form-error">{approvalError}</p> : null}
            <div className="sa-modal-actions">
              <button type="button" className="sa-ghost" onClick={() => setApprovalRequest(null)} disabled={Boolean(busy)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={Boolean(busy)}>
                {busy ? "Approving..." : "Approve & Provision"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
