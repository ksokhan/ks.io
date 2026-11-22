#!/usr/bin/env node
// Builds the design log: copies each checkpoint in log/checkpoints.json out
// of git into public/log/<n>/ as a static, self-contained version of the
// site, and writes public/log/index.json for the panel. Run from the repo
// root after changing checkpoints: `node scripts/build-log.mjs`. No deps.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'

const OUT = 'public/log'
// Files a version of the site needs. .woff is skipped: every browser that
// matters loads the .woff2 next to it.
const SITE_FILES = new Set(['.html', '.css', '.js', '.woff2', '.svg'])

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 })

const checkpoints = JSON.parse(readFileSync('log/checkpoints.json', 'utf8'))
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const index = checkpoints.map(({ commit, caption }, i) => {
  const id = String(i + 1)
  const base = `/log/${id}/`
  const files = git('ls-tree', '-r', '--name-only', commit).toString().trim().split('\n')
  // The site lived at the repo root before it moved into public/.
  const root = files.includes('public/index.html') ? 'public/' : ''

  for (const path of files) {
    if (!path.startsWith(root)) continue
    const rel = path.slice(root.length)
    if (rel.startsWith('node_modules/') || rel.startsWith('log/') || rel.startsWith('.')) continue
    // Not part of a snapshot: the recorder, and the log itself (no log in a log).
    if (rel === 'record-typing.html' || rel === 'log.js' || !SITE_FILES.has(extname(rel))) continue

    let data = git('show', `${commit}:${path}`)
    if (rel.endsWith('.html')) data = Buffer.from(fixHtml(data.toString(), base))
    if (rel.endsWith('.css')) data = Buffer.from(fixCss(data.toString(), base))
    const dest = join(OUT, id, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, data)
  }

  const date = git('show', '-s', '--format=%cs', commit).toString().trim()
  return { id, commit, date, caption, path: base }
})

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`Built ${index.length} checkpoints into ${OUT}/`)

// Point root-relative links at the checkpoint's own copy, drop analytics,
// keep it out of search, and start every viewing as a first visit by
// clearing the checkpoint's saved state (typed-out flag, edits).
function fixHtml(html, base) {
  html = html
    .replace(/(\s(?:href|src))="\/(?!\/)/g, `$1="${base}`)
    .replace(/[ \t]*<script[^>]*(?:plausible|\/log\.js)[^>]*><\/script>\n?/g, '')
  const head =
    '<meta name="robots" content="noindex" />' +
    `<script>try{Object.keys(localStorage).forEach(function(k){if(k.indexOf('ksio:${base}')===0)localStorage.removeItem(k)})}catch(e){}</script>`
  return html.replace(/<head>/i, `<head>${head}`)
}

function fixCss(css, base) {
  return css.replace(/url\((['"]?)\/(?!\/)/g, `url($1${base}`)
}
