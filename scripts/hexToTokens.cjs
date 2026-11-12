// One-off migration helper for the redesign: replaces hard-coded hex colours in CSS with the nearest
// theme token from src/theme.css, so screens follow light/dark automatically.
// Usage: node scripts/hexToTokens.cjs <file.css> [...]   Delete with the other redesign helpers.
const fs = require("fs")
const path = require("path")

const CANDIDATES = [
  "--bg", "--surface", "--surface-2", "--surface-3", "--border", "--border-strong",
  "--text", "--text-2", "--muted", "--brand", "--brand-hover", "--brand-soft", "--brand-ink",
  "--warning", "--warning-bg", "--danger", "--danger-soft", "--danger-text", "--info", "--info-bg",
]

const rgb = (hex) => {
  let h = hex.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join("")
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function lightTokens() {
  const theme = fs.readFileSync(path.join(__dirname, "..", "src", "theme.css"), "utf8")
  const root = theme.match(/:root\s*\{([^}]*)\}/)[1]
  const all = Object.fromEntries([...root.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]))
  return CANDIDATES.filter((t) => all[t]).map((t) => [t, rgb(all[t])])
}

// Nearest token by weighted RGB distance; white text becomes --on-brand (it sits on coloured fills).
function tokenFor(hex, property, tokens) {
  const [r, g, b] = rgb(hex)
  if (property === "color" && r > 245 && g > 245 && b > 245) return "--on-brand"
  // Each kind of property may only use the tokens meant for it.
  const allowed = /border|outline|stroke/.test(property) ? ["--border", "--border-strong", "--brand", "--danger", "--warning", "--info"]
    : property === "color" || property === "fill" ? ["--text", "--text-2", "--muted", "--brand", "--brand-ink", "--danger-text", "--warning", "--info"]
    : ["--bg", "--surface", "--surface-2", "--surface-3", "--brand", "--brand-hover", "--brand-soft", "--warning-bg", "--danger", "--danger-soft", "--info-bg", "--text"]
  let best = null, bestD = Infinity
  for (const [name, [tr, tg, tb]] of tokens.filter(([n]) => allowed.includes(n))) {
    const d = 2 * (r - tr) ** 2 + 4 * (g - tg) ** 2 + 3 * (b - tb) ** 2
    if (d < bestD) { bestD = d; best = name }
  }
  return best
}

function convert(css, tokens) {
  let count = 0
  const out = css.replace(/([a-z-]+)\s*:\s*([^;{}]*#[0-9a-fA-F]{3,8}\b[^;{}]*)/g, (decl, prop, value) => {
    if (prop.startsWith("--")) return decl // a custom property defining a colour is left for review
    const next = value.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?![0-9a-fA-F])/g, (hex) => { count++; return `var(${tokenFor(hex, prop, tokens)})` })
    return `${prop}: ${next}`
  })
  return { css: out, count }
}

if (require.main === module) {
  const tokens = lightTokens()
  for (const file of process.argv.slice(2)) {
    const { css, count } = convert(fs.readFileSync(file, "utf8"), tokens)
    fs.writeFileSync(file, css)
    console.log(`${file}: ${count} colours → tokens`)
  }
}
module.exports = { tokenFor, convert, lightTokens }
