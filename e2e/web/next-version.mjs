import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const source = path.resolve(process.argv[2] ?? path.join(root, 'dist'))
const target = path.resolve(process.argv[3] ?? path.join(root, 'dist-next'))

const CHUNKS = 'dist/_expo/static/js/web'
const HASHED = /^(.+?)-([0-9a-f]{32})\.js$/

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })
const folder = path.join(target, '_expo/static/js/web')
const renamed = new Map()
for (const file of fs.readdirSync(folder)) {
  const match = HASHED.exec(file)
  if (!match) continue
  const next = `${match[1]}-${crypto
    .createHash('md5')
    .update(match[2] + 'next')
    .digest('hex')}.js`
  renamed.set(file, next)
}

const entryName = /src="\/_expo\/static\/js\/web\/([^"]+)"/.exec(
  fs.readFileSync(path.join(target, 'index.html'), 'utf8')
)?.[1]
if (!entryName || !renamed.has(entryName))
  throw new Error(`Couldn't find the entry chunk in ${target}/index.html`)
for (const [from, to] of renamed) {
  const content = fs.readFileSync(path.join(folder, from), 'utf8')
  let rewritten = content
  for (const [old, replacement] of renamed)
    rewritten = rewritten.split(old).join(replacement)
  if (from === entryName) rewritten += "\nwindow.__wwVersion='next';\n"
  fs.writeFileSync(path.join(folder, to), rewritten)
  fs.rmSync(path.join(folder, from))
}
const html = path.join(target, 'index.html')
let page = fs.readFileSync(html, 'utf8')
for (const [old, replacement] of renamed)
  page = page.split(old).join(replacement)
fs.writeFileSync(html, page)
fs.rmSync(path.join(target, 'sw.js'), { force: true })

const { buildServiceWorker } = await import('../../scripts/web-sw.mjs')
const worker = await buildServiceWorker(target)
console.log(
  `[next-version] ${path.relative(root, target)}: ${renamed.size} chunks renamed (${CHUNKS}), sw.js precaches ${worker.count} files`
)
