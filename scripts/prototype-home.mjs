// Throwaway browser harness for issue #479. Never imported by the iOS app.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = resolve(root, 'src/features/home/prototype')
const locale = JSON.parse(readFileSync(resolve(root, 'src/locales/en-US.json')))
// Reuse the actual pure app rules without booting RN, stores, or native modules.
// These four known modules have only named declarations and static imports.
function browserSource(path) {
  return stripTypeScriptTypes(readFileSync(resolve(root, path), 'utf8'), {
    mode: 'strip',
  })
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/\bexport /g, '')
}
const runtime = `
const durationLocale = ${JSON.stringify({ hoursShort: locale.hoursShort, minutesShort: locale.minutesShort, hoursCompact: locale.hoursCompact, minutesCompact: locale.minutesCompact })};
const i18n = { t(key, vars = {}) { const v = durationLocale[key]; return (typeof v === 'string' ? v : v[vars.count === 1 ? 'one' : vars.count === 0 ? 'zero' : 'other']).replace('{{count}}', vars.count); } };
const round = (v, n = 0) => Math.round(v * 10 ** n) / 10 ** n;
${browserSource('src/lib/minutes.ts')}
${browserSource('src/constants/serviceReports.ts')}
${browserSource('src/lib/milestones.ts')}
${browserSource('src/lib/publisherCapabilities.ts')}
export { formatMinutes, formatMinutesCompact, derivePublisherCapabilities };
`
const files = {
  '/': ['index.html', 'text/html'],
  '/app.mjs': ['app.mjs', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
  '/en-US.json': ['en-US.json', 'application/json'],
}
const port = Number(process.env.PORT || 4790)
createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  res.setHeader('Cache-Control', 'no-store')
  if (path === '/runtime.mjs') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' })
    res.end(runtime)
    return
  }
  if (!files[path]) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const [file, type] = files[path]
  res.writeHead(200, { 'Content-Type': type })
  res.end(readFileSync(resolve(directory, file)))
}).listen(port, '0.0.0.0', () =>
  console.log(`Issue #479 prototype: http://localhost:${port}/?variant=A`)
)
