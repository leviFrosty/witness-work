#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const SITE = 'https://leviwilkerson.com'
const MANIFEST_PATH = '/witness-work/help-center/bundle/manifest.json'
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
