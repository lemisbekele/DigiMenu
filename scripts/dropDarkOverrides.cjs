// One-off redesign helper: removes rules that only apply under html[data-theme="dark"].
// Every colour is now a theme token that flips by itself, so these overrides only fight the theme.
// Usage: node scripts/dropDarkOverrides.cjs <file.css> [...]. Delete with the other redesign helpers.
const fs = require("fs")
const { split } = require("./cssPrune.cjs")

function drop(css) {
  let kept = "", removed = 0
  for (const { prelude, body } of split(css)) {
    const head = prelude.replace(/\/\*[\s\S]*?\*\//g, "").trim()
    if (body === null) { kept += prelude; continue }
    if (/^@(media|supports)/.test(head)) {
      const inner = drop(body)
      removed += inner.removed
      if (inner.css.trim()) kept += `\n${head} {${inner.css}\n}\n`
      continue
    }
    const selectors = head.split(",").map((s) => s.trim()).filter((s) => !/data-theme=["']?dark/.test(s))
    if (!selectors.length) { removed++; continue }
    kept += `\n${selectors.join(",\n")} {${body}}\n`
  }
  return { css: kept, removed }
}

if (require.main === module) {
  for (const file of process.argv.slice(2)) {
    const { css, removed } = drop(fs.readFileSync(file, "utf8"))
    fs.writeFileSync(file, css.replace(/\n{3,}/g, "\n\n").trimStart())
    console.log(`${file}: removed ${removed} dark-only rules`)
  }
}
module.exports = { drop }
