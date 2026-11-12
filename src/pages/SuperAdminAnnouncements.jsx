import { Megaphone } from "lucide-react"
import { EmptyState } from "../ui"
import { VisualSummary } from "../components/PlatformCharts"
import { toUserMessage } from "../services/userMessages"
import { useEffect, useState } from "react"
import { observeAnnouncements, createAnnouncement, deleteAnnouncement, ANNOUNCEMENT_TARGETS, ANNOUNCEMENT_PRIORITIES } from "../services/announcementService"
import "./superadmin-layout.css"

export function SuperAdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)

  const [newTitle, setNewTitle] = useState("")
  const [newMessage, setNewMessage] = useState("")
  const [newTarget, setNewTarget] = useState("All Cafes")
  const [newPriority, setNewPriority] = useState("Normal")
  const [showModal, setShowModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    return observeAnnouncements((data) => { setAnnouncements(data || []); setLoading(false) }, () => {
      setNotice({ type: "error", text: "Announcements could not load. Please refresh and try again." })
      setLoading(false)
    })
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newTitle.trim() || !newMessage.trim()) return
    setBusy(true)
    setError("")
    setNotice(null)
    try {
      const item = await createAnnouncement({
        title: newTitle,
        message: newMessage,
        target: newTarget,
        priority: newPriority,
      })
      setAnnouncements((prev) => [item, ...prev])
      setNewTitle("")
      setNewMessage("")
      setNewTarget("All Cafes")
      setNewPriority("Normal")
      setShowModal(false)
      setNotice({ type: "success", text: `Announcement "${item.title}" broadcast and saved.` })
    } catch (err) {
      setError(toUserMessage(err, "Could not create announcement."))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (ann) => {
    setNotice(null)
    try {
      await deleteAnnouncement(ann.id)
      setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id))
      setNotice({ type: "success", text: `Announcement "${ann.title}" deleted.` })
    } catch (err) {
      setNotice({ type: "error", text: toUserMessage(err, "Could not delete announcement.") })
    }
  }

  return (
    <div className="ui-stack">
      <div className="ui-page-header sa-row">
        <div>
          <h1>Platform Announcements</h1>
          <p>
            Broadcast system announcements, feature updates, and maintenance notices across cafe dashboards.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowModal(true); setError("") }}
          className="ui-btn ui-btn--primary"
        >
          + New Announcement
        </button>
      </div>

      {notice && (
        <div className={`ui-notice ${notice.type === "success" ? "sa-alert-success" : "sa-alert-error"}`} style={{ marginBottom: "1.25rem" }}>
          {notice.text}
        </div>
      )}

      {!loading && notice?.type !== "error" && <VisualSummary icon={Megaphone} title={`${announcements.length} published announcements`}>{announcements.filter(item => item.priority === "High").length} high priority notices. Published messages appear in the selected cafe dashboards.</VisualSummary>}

      {notice?.type === "error" ? null : loading ? (
        <p className="ui-muted">Loading announcements...</p>
      ) : announcements.length === 0 ? (
        <EmptyState title="No announcements yet" body="Create the first broadcast with New Announcement. It appears on the cafe dashboards you pick." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="ui-card ui-card--stack"
              style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}
            >
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <span className="ui-pill sa-badge-brand">{ann.target}</span>
                  <span className={`ui-pill ${ann.priority === "High" ? "sa-badge-error" : "sa-badge-neutral"}`}>{ann.priority}</span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{ann.date}</span>
                </div>
                <h3 style={{ fontSize: "var(--text-lg)", color: "var(--brand-ink)", margin: "0 0 6px" }}>{ann.title}</h3>
                <p style={{ fontSize: "var(--text-md)", color: "var(--text-3)", margin: 0 }}>{ann.message}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(ann)}
                className="ui-btn ui-btn--danger"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="sa-modal-scrim">
          <form onSubmit={handleCreate} className="sa-modal">
            <h3 style={{ margin: "0 0 1rem", color: "var(--brand-ink)" }}>Create Broadcast Announcement</h3>
            {error && (
              <div className="ui-notice sa-alert-error" style={{ marginBottom: "1rem" }}>{error}</div>
            )}
            <label className="ui-field">
              <span className="">Announcement Title</span>
              <input
                type="text"
                maxLength={160} value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Scheduled System Maintenance"
                required
                className="ui-input"
              />
            </label>
            <label className="ui-field">
              <span className="">Target Audience</span>
              <select
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="ui-input"
              >
                {ANNOUNCEMENT_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {t === "All Cafes" ? "All Cafes & Platforms" : t === "Professional & Enterprise" ? "Professional & Enterprise Only" : t}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="">Priority</span>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="ui-input"
              >
                {ANNOUNCEMENT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="">Announcement Message</span>
              <textarea
                maxLength={4000} value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={4}
                placeholder="Type the message to broadcast..."
                required
                className="ui-input"
              />
            </label>
            <div className="ui-dialog-actions">
              <button type="button" onClick={() => setShowModal(false)} className="ui-btn">Cancel</button>
              <button type="submit" disabled={busy} className="ui-btn ui-btn--primary">
                {busy ? "Broadcasting..." : "Broadcast"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}