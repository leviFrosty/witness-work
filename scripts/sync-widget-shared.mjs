#!/usr/bin/env node
// Sync generated sources for the @bacons/apple-targets targets:
//
// - Shared Swift from Expo modules (and the watch app) into the targets that
//   compile it. The source is the source of truth; targets get copies because
//   Xcode/EAS tarball flow does not reliably preserve symlinks across the
//   local-build project archive.
// - Apple Watch string catalogs from `src/locales`, so the watch's bundled
//   strings and Siri phrases use the same approved translations as the app.
//
// `--check` reports drift instead of writing (pre-commit hook).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')

/** Each entry copies `files` from the `from` directory into each `to` directory. */
const syncs = [
  {
    from: 'modules/stopwatch-bridge/ios',
    to: ['targets/widgets/Stopwatch'],
    files: [
      'StopwatchActivityController.swift',
      'StopwatchAttributes.swift',
      'StopwatchIntents.swift',
      'StopwatchStore.swift',
    ],
  },
  {
    from: 'modules/stopwatch-bridge/ios',
    to: [
      'targets/widgets/Shared',
      'targets/watch/Shared',
      'targets/watch-widgets/Shared',
    ],
    files: ['AppGroup.swift'],
  },
  {
    from: 'modules/watch-bridge/ios',
    to: ['targets/watch/Shared', 'targets/watch-widgets/Shared'],
    files: ['WatchProtocol.swift'],
  },
  {
    from: 'targets/watch',
    to: ['targets/watch-widgets/Shared'],
    files: ['WatchStorage.swift', 'WatchStrings.swift'],
  },
]

/** `src/locales` file → Apple localization identifier. */
const appleLanguages = {
  'bem-ZM': 'bem',
  'de-DE': 'de',
  'en-US': 'en',
  'es-ES': 'es',
  'fr-FR': 'fr',
  'it-IT': 'it',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'nl-NL': 'nl',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-PT',
  'ru-RU': 'ru',
  'rw-RW': 'rw',
  'sw-KE': 'sw',
  'uk-UA': 'uk',
  'vi-VN': 'vi',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
}

const check = process.argv.includes('--check')
let drift = false

function sync(to, contents) {
  const target = join(repo, to)
  const current = existsSync(target) ? readFileSync(target) : null
  if (current && current.equals(contents)) return
  if (check) {
    console.error(`drift: ${to}`)
    drift = true
  } else {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, contents)
    console.log(`synced: ${to}`)
  }
}

for (const { from, to, files } of syncs) {
  for (const dir of to) {
    for (const f of files) {
      sync(join(dir, f), readFileSync(join(repo, from, f)))
    }
  }
}

// --- Watch string catalogs ---

const keys = JSON.parse(
  readFileSync(join(repo, 'src/app/watch/watchStringKeys.json'), 'utf8')
)
const locales = Object.fromEntries(
  Object.entries(appleLanguages).map(([file, language]) => [
    language,
    JSON.parse(readFileSync(join(repo, `src/locales/${file}.json`), 'utf8')),
  ])
)
const english = locales.en

for (const key of [...keys.strings, ...keys.shortcutPhrases]) {
  if (typeof english[key] !== 'string') {
    console.error(`src/locales/en-US.json has no string "${key}"`)
    process.exit(1)
  }
}

/**
 * Xcode's String Catalog JSON layout (`"key" : value`, sorted keys), so a build
 * that rewrites the catalog leaves it unchanged.
 */
function catalogJson(value, indent = '') {
  const next = indent + '  '
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return `[\n${value.map((v) => next + catalogJson(v, next)).join(',\n')}\n${indent}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(
        (k) => `${next}${JSON.stringify(k)} : ${catalogJson(value[k], next)}`
      )
    if (!entries.length) return '{}'
    return `{\n${entries.join(',\n')}\n${indent}}`
  }
  return JSON.stringify(value)
}

/** Translations for `key`, skipping locales that don't have it yet. */
function localizations(key, valueOf = (text) => text) {
  return Object.fromEntries(
    Object.entries(locales)
      .filter(([, strings]) => typeof strings[key] === 'string' && strings[key])
      .map(([language, strings]) => [
        language,
        { stringUnit: { state: 'translated', value: valueOf(strings[key]) } },
      ])
  )
}

function catalog(strings) {
  return Buffer.from(
    catalogJson({ sourceLanguage: 'en', strings, version: '1.0' }) + '\n'
  )
}

const localizable = catalog(
  Object.fromEntries(
    keys.strings.map((key) => [
      key,
      { extractionState: 'manual', localizations: localizations(key) },
    ])
  )
)
sync('targets/watch/Localizable.xcstrings', localizable)
sync('targets/watch-widgets/Localizable.xcstrings', localizable)

// Siri phrases are keyed by the English phrase as written in Swift.
const shortcutsSwift = readFileSync(
  join(repo, 'targets/watch/WatchShortcuts.swift'),
  'utf8'
)
const appShortcuts = {}
for (const key of keys.shortcutPhrases) {
  const phrase = english[key]
  const swiftLiteral = `"${phrase.replace('${applicationName}', '\\(.applicationName)')}"`
  if (!shortcutsSwift.includes(swiftLiteral)) {
    console.error(
      `targets/watch/WatchShortcuts.swift has no phrase ${swiftLiteral} (from en-US "${key}")`
    )
    process.exit(1)
  }
  appShortcuts[phrase] = {
    extractionState: 'manual',
    localizations: localizations(key),
  }
}
sync('targets/watch/AppShortcuts.xcstrings', catalog(appShortcuts))

if (check && drift) {
  console.error('\nRun: pnpm sync:widget-shared')
  process.exit(1)
}
