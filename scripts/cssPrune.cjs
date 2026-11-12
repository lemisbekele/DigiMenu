// One-off migration helper for the redesign: removes CSS rules whose classes no JSX file uses any more.
// Usage: node scripts/cssPrune.cjs <file.css> [--drop-bare]   (--drop-bare also removes rules with no class at all,
// e.g. `main { … }` or `button:hover { … }`, which is how legacy element styles leak into new screens).
// Delete this file when Task 9 of docs/superpowers/plans/2026-11-12-redesign.md is done.
const fs = require("fs")
const path = require("path")

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx|js)$/.test(name)) out.push(p)
  }
  return out
}

// Every word that could be a class name in the source, plus prefixes of template strings like `kq-${level}`.
function usedClasses(srcDir) {
  const exact = new Set(), prefixes = new Set()
  for (const file of walk(srcDir)) {
    const text = fs.readFileSync(file, "utf8")
    for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_-]*/g)) exact.add(m[0])
    for (const m of text.matchAll(/([A-Za-z][A-Za-z0-9_-]*-)\$\{/g)) prefixes.add(m[1])
  }
  return (cls) => exact.has(cls) || [...prefixes].some((p) => cls.startsWith(p))
}

// Split CSS into top-level statements: [{ prelude, body }] where body is null for `@import x;`.
function split(css) {
  const out = []
  let depth = 0, start = 0, open = -1
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === "/" && css[i + 1] === "*") { i = css.indexOf("*/", i + 2) + 1; if (i <= 0) break; continue }
    if (c === "{") { if (depth === 0) open = i; depth++ }
    else if (c === "}") { if (--depth === 0) { out.push({ prelude: css.slice(start, open), body: css.slice(open + 1, i) }); start = i + 1 } }
    else if (c === ";" && depth === 0) { out.push({ prelude: css.slice(start, i + 1), body: null }); start = i + 1 }
  }
  return out
}

// Split a selector list on commas that are not inside (...) — :is(.a, .b) stays whole.
function splitTop(list) {
  const parts = []
  let depth = 0, start = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "(") depth++
    else if (list[i] === ")") depth--
    else if (list[i] === "," && depth === 0) { parts.push(list.slice(start, i)); start = i + 1 }
  }
  parts.push(list.slice(start))
  return parts
}

function prune(css, isUsed, dropBare) {
  let kept = "", removed = 0
  for (const { prelude, body } of split(css)) {
    const head = prelude.replace(/\/\*[\s\S]*?\*\//g, "").trim()
    if (body === null) { kept += prelude; continue }
    if (/^@(media|supports|container|layer)/.test(head)) {
      const inner = prune(body, isUsed, dropBare)
      removed += inner.removed
      if (inner.css.trim()) kept += `\n${head} {${inner.css}\n}\n`
      continue
    }
    if (head.startsWith("@")) { kept += `\n${head} {${body}}\n`; continue } // @keyframes, @font-face
    const selectors = splitTop(head).map((s) => s.trim()).filter((sel) => {
      const classes = [...sel.replace(/:not\([^)]*\)/g, "").matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1])
      if (/:(is|where|has)\(/.test(sel)) return true // any listed class may match; keep the rule
      if (!classes.length) return !dropBare || /^(:root|html|body|#root|\*)/.test(sel)
      return classes.every(isUsed)
    })
    if (selectors.length) kept += `\n${selectors.join(",\n")} {${body}}\n`
    else removed++
  }
  return { css: kept, removed }
}

if (require.main === module) {
  const file = process.argv[2]
  const result = prune(fs.readFileSync(file, "utf8"), usedClasses(path.join(__dirname, "..", "src")), process.argv.includes("--drop-bare"))
  fs.writeFileSync(file, result.css.replace(/\n{3,}/g, "\n\n").trimStart())
  console.log(`${file}: removed ${result.removed} rules, ${result.css.split("\n").length} lines left`)
}
module.exports = { prune, split }
