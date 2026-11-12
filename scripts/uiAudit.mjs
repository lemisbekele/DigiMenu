// Uniformity audit for the redesign (docs/superpowers/specs/2026-11-12-redesign-design.md).
// node scripts/uiAudit.mjs [--strict]  -> prints counts; --strict exits 1 unless the end targets are met.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [text token, background token] pairs the shared parts rely on; each must reach 4.5:1 in both themes.
const PAIRS = [
  ["--text", "--surface"], ["--text", "--bg"], ["--text-2", "--surface"], ["--text-2", "--bg"],
  ["--muted", "--surface"], ["--muted", "--bg"], ["--text-2", "--surface-2"],
  ["--on-brand", "--brand"], ["--brand-ink", "--brand-soft"], ["--warning", "--warning-bg"],
  ["--danger-text", "--danger-soft"], ["--info", "--info-bg"],
]

const tokensIn = (block) => Object.fromEntries(
  [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]),
)

export function auditTokens(cssText) {
  const light = tokensIn((cssText.match(/:root\s*\{([^}]*)\}/) || [])[1] || "")
  const dark = { ...light, ...tokensIn((cssText.match(/html\[data-theme="dark"\]\s*\{([^}]*)\}/) || [])[1] || "") }
  const failures = []
  for (const [name, set] of [["light", light], ["dark", dark]]) {
    for (const [fg, bg] of PAIRS) {
      if (!set[fg] || !set[bg]) continue
      const ratio = contrastRatio(set[fg], set[bg])
      if (ratio < 4.5) failures.push(`${name}: ${fg} on ${bg} ${ratio.toFixed(2)}`)
    }
  }
  return failures
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(jsx|css)$/.test(name) && !/\.test\./.test(name)) out.push(path)
  }
  return out
}

export function auditSource(srcDir) {
  let inlineStyles = 0, hexOutsideTheme = 0
  const fontSizes = new Set(), radii = new Set()
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, "utf8")
    inlineStyles += (text.match(/style=\{\{/g) || []).length
    if (!file.endsWith("theme.css")) hexOutsideTheme += (text.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => [4, 7, 9].includes(h.length)).length
    if (file.endsWith(".css")) {
      for (const m of text.matchAll(/font-size:\s*([^;}\n]+)/g)) fontSizes.add(m[1].trim())
      for (const m of text.matchAll(/border-radius:\s*([^;}\n]+)/g)) radii.add(m[1].trim())
    }
  }
  return { inlineStyles, hexOutsideTheme, fontSizes: fontSizes.size, radii: radii.size }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = join(fileURLToPath(new URL("..", import.meta.url)), "src")
  const result = { ...auditSource(src), contrastFailures: auditTokens(readFileSync(join(src, "theme.css"), "utf8")) }
  console.log(JSON.stringify(result, null, 2))
  const ok = result.hexOutsideTheme === 0 && result.fontSizes <= 6 && result.radii <= 4 && result.contrastFailures.length === 0
  if (process.argv.includes("--strict") && !ok) process.exit(1)
}
