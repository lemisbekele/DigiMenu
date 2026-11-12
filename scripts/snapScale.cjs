// One-off migration helper for the redesign: snaps literal font sizes and corner radii in CSS to the
// design scale (docs/design-language.html). Usage: node scripts/snapScale.cjs <file.css> [...]
// Delete with the other redesign helpers.
const fs = require("fs")

const TEXT = [[12, "--text-xs"], [13, "--text-sm"], [14, "--text-md"], [16, "--text-lg"], [20, "--text-xl"], [28, "--text-2xl"]]
const RADIUS = [[8, "--radius-sm"], [12, "--radius-md"], [16, "--radius-lg"]]

const px = (v) => {
  const m = String(v).trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/)
  if (!m) return null
  return m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16 // em treated as rem; only used for literal sizes
}
const nearest = (n, scale) => scale.reduce((best, cur) => (Math.abs(cur[0] - n) < Math.abs(best[0] - n) ? cur : best))[1]

// Font sizes above 40px are display text on the marketing pages; they keep their own value.
function snapFont(value) {
  if (/var\(|inherit|%|clamp|calc|min\(|max\(/.test(value)) return value
  const n = px(value.replace(/\s*!important$/, ""))
  if (n == null || n > 40) return value
  return `var(${nearest(n, TEXT)})${/!important$/.test(value) ? " !important" : ""}`
}

function snapRadiusPart(part) {
  const n = px(part)
  if (n == null) return part
  if (n === 0) return "0"
  if (n >= 24) return "var(--radius-pill)"
  if (n <= 4) return part // hairline rounding on bars and tracks stays
  return `var(${nearest(n, RADIUS)})`
}
function snapRadius(value) {
  if (/var\(|inherit|calc/.test(value)) return value
  const important = /!important$/.test(value)
  const core = value.replace(/\s*!important$/, "")
  if (core.trim() === "50%") return value
  if (core.includes("/")) return value
  const parts = core.trim().split(/\s+/).map(snapRadiusPart)
  return parts.join(" ") + (important ? " !important" : "")
}

function snap(css) {
  let changed = 0
  const out = css
    .replace(/font-size:\s*([^;}\n]+)/g, (m, v) => { const n = snapFont(v.trim()); if (n !== v.trim()) changed++; return `font-size: ${n}` })
    .replace(/border-radius:\s*([^;}\n]+)/g, (m, v) => { const n = snapRadius(v.trim()); if (n !== v.trim()) changed++; return `border-radius: ${n}` })
  return { css: out, changed }
}

if (require.main === module) {
  for (const file of process.argv.slice(2)) {
    const { css, changed } = snap(fs.readFileSync(file, "utf8"))
    fs.writeFileSync(file, css)
    console.log(`${file}: ${changed} values snapped`)
  }
}
module.exports = { snapFont, snapRadius, snap }
