#!/usr/bin/env node
/**
 * Copies the Help Center's published bundles into the app as its offline
 * snapshot (`src/assets/help-center/<locale>.json`). The app shows the snapshot
 * until it has downloaded a newer bundle, so run this before every release
 * build. The content itself lives in portfolio-v2 (`content/help/`).
 *
 * Usage: pnpm sync:help # from https://leviwilkerson.com pnpm sync:help
 * --from<dir> # from a local site build's bundle directory #
 * (portfolio-v2/dist/public/witness-work/help-center/bundle)
 *
 * Snapshots are compacted, since they ship in the JavaScript bundle: no
 * `plainText` or `url` (the app derives them from `doc` and the contract's URL
 * pattern), and no English fallback entries outside `en-US.json` (the app fills
 * them in from English). Written minified. Fails without writing anything if a
 * locale is missing or a bundle isn't schema version 1.
 */
import fs from 'node:fs'
import path from 'node:path'

const SITE = 'https://leviwilkerson.com'
const MANIFEST_PATH = '/witness-work/help-center/bundle/manifest.json'
const OUT_DIR = 'src/assets/help-center'
// Every app language (src/lib/locales.ts), by locale file name.
const LOCALES = [
  'en-US',
  'ar',
  'bem-ZM',
  'de-DE',
  'es-ES',
  'fr-FR',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nl-NL',
  'pt-BR',
  'pt-PT',
  'ru-RU',
  'rw-RW',
  'sw-KE',
  'uk-UA',
  'vi-VN',
  'zh-CN',
  'zh-TW',
]

const fromIndex = process.argv.indexOf('--from')
const fromDir = fromIndex === -1 ? undefined : process.argv[fromIndex + 1]
if (fromIndex !== -1 && !fromDir) {
  console.error('--from needs the bundle directory')
  process.exit(1)
}

/** Reads `sitePath` (`/witness-work/help-center/bundle/x.json`) as JSON. */
async function read(sitePath) {
  if (fromDir) {
    const file = path.join(fromDir, path.basename(sitePath))
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  const response = await fetch(new URL(sitePath, SITE), {
    headers: { 'Cache-Control': 'no-cache' },
  })
  if (!response.ok) throw new Error(`${sitePath}: HTTP ${response.status}`)
  return response.json()
}

const fail = (message) => {
  console.error(`sync:help: ${message}`)
  process.exit(1)
}

const manifest = await read(MANIFEST_PATH)
if (manifest?.schemaVersion !== 1) fail('manifest is not schema version 1')

const snapshots = []
for (const locale of LOCALES) {
  const published = manifest.locales?.[locale]
  if (!published) fail(`the manifest has no ${locale} bundle`)
  const bundle = await read(published.path)
  if (bundle?.schemaVersion !== 1 || bundle.locale !== locale)
    fail(`${locale}: not a schema-1 bundle for this locale`)
  if (!Array.isArray(bundle.entries) || bundle.entries.length === 0)
    fail(`${locale}: no entries`)
  if (bundle.hash !== published.hash)
    fail(`${locale}: bundle hash differs from the manifest; retry shortly`)
  const entries = bundle.entries
    .filter((entry) => locale === 'en-US' || !entry.fallback)
    .map((entry) => {
      const snapshot = { ...entry }
      delete snapshot.plainText
      delete snapshot.url
      return snapshot
    })
  snapshots.push({ locale, json: JSON.stringify({ ...bundle, entries }) })
}

fs.mkdirSync(OUT_DIR, { recursive: true })
let total = 0
for (const { locale, json } of snapshots) {
  fs.writeFileSync(path.join(OUT_DIR, `${locale}.json`), `${json}\n`)
  total += Buffer.byteLength(json)
}
console.log(
  `sync:help: wrote ${snapshots.length} snapshots to ${OUT_DIR} (${(
    total / 1024
  ).toFixed(0)} KB, generated ${manifest.generatedAt})`
)
