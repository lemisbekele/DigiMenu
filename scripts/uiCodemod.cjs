// One-off migration helper for the redesign: renames legacy class names to the shared ui- parts
// inside className attributes only. Usage: node scripts/uiCodemod.cjs <file.jsx> [...]
// Delete this file when Task 9 of docs/superpowers/plans/2026-11-12-redesign.md is done.
const fs = require("fs")

const MAP = {
  // buttons
  "primary-button": "ui-btn ui-btn--primary", "ghost-button": "ui-btn", "danger-button": "ui-btn ui-btn--danger",
  "icon-button": "ui-btn ui-btn--quiet ui-btn--icon", "compact-btn": "", "small": "", "compact": "",
  "oc-main": "ui-btn ui-btn--primary", "oc-quiet": "ui-btn", "oc-danger": "ui-btn--danger",
  "oc-head-action": "ui-btn ui-btn--primary", "ad-icon": "ui-btn ui-btn--quiet ui-btn--icon",
  "sa-ghost": "ui-btn", "sa-btn": "ui-btn ui-btn--primary",
  // page structure
  "oc-page": "ui-stack", "ad-stack": "ui-stack", "admin-stack": "ui-stack", "sa-page": "ui-stack",
  "oc-head": "ui-page-header", "oc-toolbar": "ui-toolbar", "oc-search": "ui-search",
  "oc-stats": "ui-stats", "oc-stat": "ui-stat", "sa-stats": "ui-stats",
  "oc-chips": "ui-chips", "oc-chip": "ui-chip", "oc-chip-count": "ui-muted",
  "oc-grid": "ui-grid", "oc-card": "ui-card ui-card--stack", "oc-actions": "ui-row", "row-actions": "ui-row",
  "ad-section": "ui-card ui-card--stack", "ad-section-head": "ui-section-head", "sa-panel": "ui-card ui-card--stack", "sa-card": "ui-card ui-card--stack",
  // lists
  "ad-list": "ui-list", "ad-row": "ui-list-row", "ad-row-main": "ui-list-main", "ad-row-title": "ui-list-title",
  "ad-row-sub": "ui-list-sub", "ad-row-actions": "ui-row",
  // forms
  "ad-field": "ui-field", "field": "ui-field", "sa-field": "ui-field", "ad-fields": "ui-form-row", "ad-form": "ui-form",
  "ad-select": "ui-input", "sa-input": "ui-input", "sa-label": "", "form-error": "ui-error", "field-hint": "ui-muted",
  "ad-switch": "ui-switch", "oc-dialog-form": "ui-form", "edit-modal-actions": "ui-dialog-actions", "sa-modal-actions": "ui-dialog-actions",
  // superadmin
  "sa-head": "ui-page-header", "sa-tabs": "ui-seg", "sa-tab": "", "sa-workspace-tabs": "ui-seg", "sa-badge": "ui-pill",
  "sa-alert": "ui-notice", "sa-notice": "ui-muted", "sa-search": "ui-search", "sa-empty": "ui-empty",
  "sa-select": "ui-input", "sa-textarea": "ui-input", "form-grid": "ui-form-row", "form-help": "ui-muted",
  "sa-panel-title": "ui-section-head", "sa-card-title": "ui-section-head", "sa-panel-flush": "ui-card--flush",
  "sa-grid-2": "ui-grid", "sa-grid-3": "ui-grid", "sa-page-toolbar": "ui-toolbar",
  // feedback
  "oc-empty": "ui-empty", "empty-state": "ui-empty", "badge": "ui-pill", "eyebrow": "ui-muted",
  "sa-table": "ui-table", "sa-table-wrap": "ui-table-wrap", "sa-inline-actions": "ui-row",
}

const swap = (text) => text.split(/(\s+)/).map((t) => (t in MAP ? MAP[t] : t)).join("").replace(/ {2,}/g, " ")
// Only string literals are rewritten; ${...} holes and expressions are left alone.
const inStrings = (expr) => expr
  .replace(/"([^"]*)"/g, (m, s) => `"${swap(s).trim()}"`)
  .replace(/'([^']*)'/g, (m, s) => `'${swap(s).trim()}'`)
  .replace(/`([^`]*)`/g, (m, s) => "`" + s.split(/(\$\{[^}]*\})/).map((part) => (part.startsWith("${") ? inStrings(part) : swap(part))).join("") + "`")

function migrate(source) {
  let out = "", i = 0
  for (;;) {
    const at = source.indexOf("className=", i)
    if (at < 0) return out + source.slice(i)
    const start = at + "className=".length
    out += source.slice(i, start)
    if (source[start] === '"') {
      const end = source.indexOf('"', start + 1)
      out += `"${swap(source.slice(start + 1, end)).trim()}"`
      i = end + 1
    } else if (source[start] === "{") {
      let depth = 0, end = start
      for (; end < source.length; end++) {
        if (source[end] === "{") depth++
        else if (source[end] === "}" && --depth === 0) break
      }
      out += inStrings(source.slice(start, end + 1))
      i = end + 1
    } else i = start
  }
}

for (const file of process.argv.slice(2)) {
  const before = fs.readFileSync(file, "utf8")
  const after = migrate(before)
  if (after !== before) { fs.writeFileSync(file, after); console.log("migrated", file) }
}
module.exports = { migrate, MAP }
