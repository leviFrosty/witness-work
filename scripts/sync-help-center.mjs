#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const MANIFEST_URL = 'https://witnesswork.app/help/bundle/manifest.json'
const BUNDLE_PATH = '/help/bundle/'
const OUT_DIR = 'src/assets/help-center'
const IMAGES_DIR = path.join(OUT_DIR, 'images')
const IMAGES_PATH = '/help/images/'
const IMAGE_FILE = /^[a-z0-9-]+\.[0-9a-f]{12}\.webp$/
const IMAGE_MODULE = 'src/features/updates/lib/helpCenter/snapshotImages.ts'

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

const imageUrls = new Map()
const collectImages = (node) => {
  if (!node || typeof node !== 'object') return
  if (node.type === 'image' && typeof node.attrs?.src === 'string') {
    const url = new URL(node.attrs.src)
    const name = url.pathname.slice(IMAGES_PATH.length)
    if (
      url.origin !== manifestUrl.origin ||
      !url.pathname.startsWith(IMAGES_PATH) ||
      !IMAGE_FILE.test(name)
    )
      fail(`${url.href} isn't a Help Center image on ${manifestUrl.origin}`)
    imageUrls.set(name, url)
  }
  for (const child of Array.isArray(node.content) ? node.content : [])
    collectImages(child)
}
for (const { json } of snapshots)
  for (const entry of JSON.parse(json).entries) collectImages(entry.doc)

async function readImage(url) {
  if (fromDir) {
    const siteRoot = path.join(
      fromDir,
      ...BUNDLE_PATH.split('/')
        .filter(Boolean)
        .map(() => '..')
    )
    return fs.readFileSync(path.join(siteRoot, url.pathname))
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url.href}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

fs.mkdirSync(IMAGES_DIR, { recursive: true })
let imageBytes = 0
for (const [name, url] of imageUrls) {
  const file = path.join(IMAGES_DIR, name)
  if (!fs.existsSync(file)) fs.writeFileSync(file, await readImage(url))
  imageBytes += fs.statSync(file).size
}
for (const name of fs.readdirSync(IMAGES_DIR))
  if (!imageUrls.has(name)) fs.rmSync(path.join(IMAGES_DIR, name))
const names = [...imageUrls.keys()].sort()
fs.mkdirSync(path.dirname(IMAGE_MODULE), { recursive: true })
fs.writeFileSync(
  IMAGE_MODULE,
  `export const snapshotImages: Record<string, number> = {${names
    .map(
      (name) =>
        `\n  '${name}': require('../../../../assets/help-center/images/${name}'),`
    )
    .join('')}${names.length ? '\n' : ''}}
`
)

fs.mkdirSync(OUT_DIR, { recursive: true })
let total = 0
for (const { locale, json } of snapshots) {
  const packed = zlib.deflateRawSync(json, { level: 9 }).toString('base64url')
  fs.writeFileSync(
    path.join(OUT_DIR, `${locale}.json`),
    `${JSON.stringify(packed)}\n`
  )
  total += packed.length
}
console.log(
  `sync:help: wrote ${snapshots.length} snapshots to ${OUT_DIR} (${(
    total / 1024
  ).toFixed(
    0
  )} KB, generated ${manifest.generatedAt}) and ${names.length} screenshots (${(
    imageBytes / 1024
  ).toFixed(0)} KB)`
)
