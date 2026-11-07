#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const MANIFEST_URL = 'https://witnesswork.app/help/bundle/manifest.json'
const BUNDLE_PATH = '/help/bundle/'
const OUT_DIR = 'src/assets/help-center'

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
