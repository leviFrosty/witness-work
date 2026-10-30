#!/usr/bin/env node
/**
 * Copies the Help Center's published bundles into the app as its offline
 * snapshot (`src/assets/help-center/<locale>.json`). The app shows the snapshot
 * until it has downloaded a newer bundle, so run this before every release
 * build. The content itself lives in `services/marketing/content/help/`; the
 * bundles' contract is docs/help-center.md.
 *
 * Usage:
 *
 *     pnpm sync:help             # from https://witnesswork.app/help/bundle/manifest.json
 *     pnpm sync:help --from <dir>  # from a local site build's bundle folder:
 *                                  # services/marketing/dist/production/client/help/bundle
 *     pnpm sync:help --manifest https://dev.witnesswork.app/help/bundle/manifest.json
 *                                  # from another copy of the site: web builds
 *                                  # use their profile's (config/web-environments.json)
 *
 * The manifest lists each bundle by absolute URL (a site path also works); with
 * `--from`, a URL under /help/bundle/ reads the same file in <dir>.
 *
 * Snapshots are compacted, since they ship in the JavaScript bundle: no
 * `plainText` or `url` (the app derives them from `doc` and the contract's URL
 * pattern), and no English fallback entries outside `en-US.json` (the app fills
 * them in from English). Written minified. Fails without writing anything if a
 * locale is missing or a bundle isn't schema version 1.
 */
import fs from 'node:fs'
import path from 'node:path'

const MANIFEST_URL = 'https://witnesswork.app/help/bundle/manifest.json'
const BUNDLE_PATH = '/help/bundle/'
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
const manifestIndex = process.argv.indexOf('--manifest')
const manifestArg =
  manifestIndex === -1 ? MANIFEST_URL : process.argv[manifestIndex + 1]
if (
  !URL.canParse(manifestArg ?? '') ||
  new URL(manifestArg).protocol !== 'https:' ||
  new URL(manifestArg).pathname !== `${BUNDLE_PATH}manifest.json`
) {
  console.error(
    `--manifest needs an https URL ending ${BUNDLE_PATH}manifest.json`
  )
  process.exit(1)
}

const fail = (message) => {
  console.error(`sync:help: ${message}`)
  process.exit(1)
}

/** Reads a bundle file's URL as JSON, from the site or from `--from`. */
async function read(url) {
  if (fromDir) {
    if (!url.pathname.startsWith(BUNDLE_PATH))
      fail(`${url.href} isn't in the build's ${BUNDLE_PATH} folder`)
    const file = path.join(fromDir, url.pathname.slice(BUNDLE_PATH.length))
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  const response = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' },
  })
  if (!response.ok) throw new Error(`${url.href}: HTTP ${response.status}`)
  return response.json()
}

const manifestUrl = new URL(manifestArg)
const manifest = await read(manifestUrl)
if (manifest?.schemaVersion !== 1) fail('manifest is not schema version 1')

const snapshots = []
for (const locale of LOCALES) {
  const published = manifest.locales?.[locale]
  if (!published) fail(`the manifest has no ${locale} bundle`)
  let bundleUrl
  try {
    bundleUrl = new URL(published.path, manifestUrl)
  } catch {
    fail(`${locale}: the manifest's path isn't a URL`)
  }
  // Only the site's own bundles, never another host's (or a dev build's).
  if (bundleUrl.origin !== manifestUrl.origin)
    fail(`${locale}: ${bundleUrl.href} isn't on ${manifestUrl.origin}`)
  const bundle = await read(bundleUrl)
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
