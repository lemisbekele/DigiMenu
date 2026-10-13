import { supabase } from "./supabase"
import { recordAuditLog } from "./dataService"

export const ANNOUNCEMENT_TARGETS = ["All Cafes", "Professional & Enterprise", "Superadmins Only"]

export const ANNOUNCEMENT_PRIORITIES = ["Normal", "High"]

export async function fetchAnnouncements() {
  const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(100)
  if (error) throw error
  return (data || []).map((a) => ({ ...a, date: (a.created_at || "").slice(0, 10) }))
}

export function observeAnnouncements(callback, onError) {
  let isSubscribed = true
  let channel = null

  const load = async () => {
    try {
      const data = await fetchAnnouncements()
      if (isSubscribed) callback(data || [])
    } catch { if (isSubscribed) onError?.("Announcements could not load.") }
  }

  load()

  try {
    const channelName = `announcements-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, load)
      .subscribe()
  } catch {}

  return () => {
    isSubscribed = false
    if (channel) supabase.removeChannel(channel).catch(() => {})
  }
}

export async function createAnnouncement({ title, message, target, priority }) {
  const cleanTitle = (title || "").trim()
  const cleanMessage = (message || "").trim()
  if (!cleanTitle) throw new Error("Announcement title is required.")
  if (!cleanMessage) throw new Error("Announcement message is required.")

  const record = {
    id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTitle,
    message: cleanMessage,
    target: target || "All Cafes",
    priority: priority || "Normal",
    created_at: new Date().toISOString(),
  }

  const { error } = await supabase.from("announcements").insert([record])
  if (error) throw new Error("Announcement could not be saved.")

  await recordAuditLog("announcement.create", {
    id: record.id,
    title: cleanTitle,
    target: record.target,
    priority: record.priority,
  }).catch(() => {})

  return {
    id: record.id,
    title: cleanTitle,
    message: cleanMessage,
    target: record.target,
    priority: record.priority,
    date: record.created_at.slice(0, 10),
  }
}

export async function deleteAnnouncement(id) {
  if (!id) throw new Error("Announcement id is required.")

  const { error } = await supabase.from("announcements").delete().eq("id", id)
  if (error) throw new Error("Announcement could not be deleted.")

  await recordAuditLog("announcement.delete", { id }).catch(() => {})

  return id
}