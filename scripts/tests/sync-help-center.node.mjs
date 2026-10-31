import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// node --test scripts/tests/sync-help-center.node.mjs
const script = fileURLToPath(
  new URL('../sync-help-center.mjs', import.meta.url)
)
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

const fixtures = []
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-sync-help-'))
  fixtures.push(dir)
  return dir
}
afterEach(() =>
  fixtures
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }))
)

const entry = (locale) => ({
  id: 'timeRollover',
  slug: 'time-rollover',
  category: 'time',
  platforms: ['ios', 'android'],
  pinned: true,
  related: [],
  question: `Rollover (${locale})`,
  doc: { type: 'doc', content: [{ type: 'paragraph' }] },
  plainText: 'Partial hours roll over.',
  url: `https://witnesswork.app/help/time/time-rollover`,
})

/** A site build's bundle folder whose manifest lists `pathFor(locale)`. */
function siteBuild(pathFor) {
  const dir = fixture()
  const bundleDir = path.join(dir, 'help/bundle')
  fs.mkdirSync(bundleDir, { recursive: true })
  const manifest = { schemaVersion: 1, generatedAt: 'now', locales: {} }
  for (const locale of LOCALES) {
    const hash = `${locale}-hash`
    const bundle = {
      schemaVersion: 1,
      locale,
      hash,
      generatedAt: 'now',
      categories: [{ id: 'time', title: 'Time' }],
      entries: [entry(locale)],
    }
    fs.writeFileSync(
      path.join(bundleDir, `${locale}.json`),
      JSON.stringify(bundle)
    )
    manifest.locales[locale] = { hash, count: 1, path: pathFor(locale) }
  }
  fs.writeFileSync(
    path.join(bundleDir, 'manifest.json'),
    JSON.stringify(manifest)
  )
  return bundleDir
}

function sync(bundleDir, args = []) {
  const cwd = fixture()
  const result = spawnSync(
    process.execPath,
    [script, '--from', bundleDir, ...args],
    { cwd, encoding: 'utf8' }
  )
  const snapshot = (locale) =>
    JSON.parse(
      fs.readFileSync(
        path.join(cwd, 'src/assets/help-center', `${locale}.json`),
        'utf8'
      )
    )
  return { result, snapshot }
}

test('reads a local build whose manifest lists absolute bundle URLs', () => {
  const bundleDir = siteBuild(
    (locale) => `https://witnesswork.app/help/bundle/${locale}.json`
  )
  const { result, snapshot } = sync(bundleDir)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(snapshot('ar').entries[0].question, 'Rollover (ar)')
  assert.equal(snapshot('en-US').entries[0].url, undefined)
})

test('still reads a manifest that lists site paths', () => {
  const bundleDir = siteBuild((locale) => `/help/bundle/${locale}.json`)
  const { result, snapshot } = sync(bundleDir)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(snapshot('zh-TW').locale, 'zh-TW')
})

test('refuses a bundle URL outside the build it reads', () => {
  const bundleDir = siteBuild((locale) =>
    locale === 'de-DE'
      ? 'https://example.com/elsewhere/de-DE.json'
      : `https://witnesswork.app/help/bundle/${locale}.json`
  )
  const { result } = sync(bundleDir)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /de-DE/)
})

test('reads another copy of the site, such as the dev website, by its manifest', () => {
  const manifest = [
    '--manifest',
    'https://dev.witnesswork.app/help/bundle/manifest.json',
  ]
  const dev = siteBuild(
    (locale) => `https://dev.witnesswork.app/help/bundle/${locale}.json`
  )
  const { result, snapshot } = sync(dev, manifest)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(snapshot('en-US').locale, 'en-US')
  // Its bundles must be on its own host too.
  const apex = siteBuild(
    (locale) => `https://witnesswork.app/help/bundle/${locale}.json`
  )
  assert.match(sync(apex, manifest).result.stderr, /isn't on https:\/\/dev\./)
  for (const url of [
    'http://dev.witnesswork.app/help/bundle/manifest.json',
    'https://dev.witnesswork.app/manifest.json',
    'not a url',
  ])
    assert.match(sync(dev, ['--manifest', url]).result.stderr, /--manifest/)
})
