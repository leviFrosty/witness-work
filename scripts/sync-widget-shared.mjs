#!/usr/bin/env node
// Sync generated sources for the @bacons/apple-targets targets:
//
// - Shared Swift from Expo modules (and the watch and Siri targets) into the
//   targets that compile it. The source is the source of truth; targets get
//   copies because Xcode/EAS tarball flow does not reliably preserve symlinks
//   across the local-build project archive.
// - String catalogs for the watch and Siri (`targets/intents`) from
//   `src/locales`, so their bundled strings and Siri phrases use the same
//   translations as the app, and English where a language has none yet.
//
// `--check` reports drift instead of writing (pre-commit hook).
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
      'targets/intents/Shared',
    ],
    files: ['AppGroup.swift'],
  },
  {
    // Siri changes the timer from its own process. Not the Live Activity
    // intents: they'd be listed as Siri actions too.
    from: 'modules/stopwatch-bridge/ios',
    to: ['targets/intents/Shared'],
    files: [
      'StopwatchActivityController.swift',
      'StopwatchAttributes.swift',
      'StopwatchStore.swift',
    ],
  },
  {
    from: 'modules/watch-bridge/ios',
    to: [
      'targets/watch/Shared',
      'targets/watch-widgets/Shared',
      'targets/intents/Shared',
    ],
    files: ['WatchProtocol.swift'],
  },
  {
    from: 'modules/watch-bridge/ios',
    to: ['targets/intents/Shared'],
    files: ['IntentInbox.swift'],
  },
  {
    // The same Siri actions on the iPhone and the watch.
    from: 'targets/intents',
    to: ['targets/watch/Shared'],
    files: ['ServiceIntents.swift', 'ServiceShortcuts.swift'],
  },
  {
    from: 'targets/watch',
    to: ['targets/watch-widgets/Shared'],
    files: [
      'MonthProgress.swift',
      'PaceBar.swift',
      'UpNext.swift',
      'WatchStorage.swift',
      'WatchStrings.swift',
    ],
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

/** `mileage.car` reads the nested `mileage` object, like i18n does. */
function lookup(strings, key) {
  if (typeof strings[key] === 'string') return strings[key]
  const value = key.split('.').reduce((node, part) => node?.[part], strings)
  return typeof value === 'string' ? value : undefined
}

/** The translation of `key`, unless it's missing or blank. */
function translation(strings, key) {
  const value = lookup(strings, key)
  return value?.trim() ? value : undefined
}

/**
 * Every `src/locales` file by name (`es-ES`). Fails on a file with no Apple
 * language, so a new language can't be left out of the catalogs.
 */
export function readLocales(directory) {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
  const unmapped = files.filter((file) => !appleLanguages[file])
  if (unmapped.length) {
    throw new Error(
      `Add ${unmapped.join(', ')} to appleLanguages in scripts/sync-widget-shared.mjs`
    )
  }
  return Object.fromEntries(
    files
      .sort()
      .map((file) => [
        file,
        JSON.parse(readFileSync(join(directory, `${file}.json`), 'utf8')),
      ])
  )
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

function catalog(strings) {
  return catalogJson({ sourceLanguage: 'en', strings, version: '1.0' }) + '\n'
}

function english(locales, key) {
  const value = translation(locales['en-US'], key)
  if (!value) throw new Error(`src/locales/en-US.json has no string "${key}"`)
  return value
}

/**
 * A string catalog with `keys` in every language. A bundle doesn't fall back to
 * English for a key its language lacks; Siri and the watch would show the key
 * itself. So until a language has a translation it gets the English text,
 * marked for review, as the app does (`enableFallback` in `src/lib/locales`).
 */
export function stringCatalog(locales, keys) {
  const strings = {}
  for (const key of new Set(keys)) {
    const fallback = english(locales, key)
    strings[key] = {
      extractionState: 'manual',
      localizations: Object.fromEntries(
        Object.entries(locales).map(([file, values]) => {
          const value = translation(values, key)
          return [
            appleLanguages[file],
            {
              stringUnit: value
                ? { state: 'translated', value }
                : { state: 'needs_review', value: fallback },
            },
          ]
        })
      ),
    }
  }
  return catalog(strings)
}

const APP_NAME = '${applicationName}'
const SWIFT_APP_NAME = '\\(.applicationName)'

/**
 * Siri phrases, keyed by the English phrase as written in `shortcutsSwift`. A
 * language without a translation has no phrases: Siri listens in one language,
 * so English phrases wouldn't help there, and the actions still appear in the
 * Shortcuts app.
 *
 * Returns the catalog and what's wrong with any phrase. Apple requires the app
 * name in each phrase, phrases can't take numbers, and two can't be the same.
 */
export function shortcutCatalog(locales, phraseKeys, shortcutsSwift) {
  const problems = []
  const englishPhrases = new Set()
  const strings = {}
  for (const key of phraseKeys) {
    const phrase = english(locales, key)
    englishPhrases.add(phrase)
    const swiftLiteral = `"${phrase.replace(APP_NAME, SWIFT_APP_NAME)}"`
    if (!shortcutsSwift.includes(swiftLiteral)) {
      problems.push(
        `targets/intents/ServiceShortcuts.swift has no phrase ${swiftLiteral} (from en-US "${key}")`
      )
    }
    const localizations = {}
    for (const [file, values] of Object.entries(locales)) {
      const value = translation(values, key)
      if (value) {
        localizations[appleLanguages[file]] = {
          stringUnit: { state: 'translated', value },
        }
      }
    }
    strings[phrase] = { extractionState: 'manual', localizations }
  }

  for (const [, swiftPhrase] of shortcutsSwift.matchAll(/"([^"\n]*)"/g)) {
    if (!swiftPhrase.includes(SWIFT_APP_NAME)) continue
    const phrase = swiftPhrase.replace(SWIFT_APP_NAME, APP_NAME)
    if (!englishPhrases.has(phrase)) {
      problems.push(
        `targets/intents/ServiceShortcuts.swift phrase "${swiftPhrase}" needs a siriShortcut* string in src/locales/en-US.json, listed under shortcutPhrases in src/app/watch/watchStringKeys.json`
      )
    }
  }

  for (const [file, values] of Object.entries(locales)) {
    const seen = new Map()
    for (const key of phraseKeys) {
      const value = translation(values, key)
      if (!value) continue
      const problem = (text) =>
        problems.push(`src/locales/${file}.json "${key}" ${text}: "${value}"`)
      if (value.split(APP_NAME).length !== 2) {
        problem(`needs ${APP_NAME} exactly once`)
      }
      if (/\$\{(?!applicationName\})|%\{/.test(value)) {
        problem(`can only use the ${APP_NAME} placeholder`)
      }
      if (/\p{Nd}/u.test(value)) problem("can't contain a number")
      const normalized = value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
      if (seen.has(normalized))
        problem(`is the same as "${seen.get(normalized)}"`)
      else seen.set(normalized, key)
    }
  }
  return { catalog: catalog(strings), problems }
}

/** Keys `swift` passes to `L10n.t` or `L10n.line` as string literals. */
export function l10nKeys(swift) {
  const keys = new Set()
  for (const [, argument] of swift.matchAll(/L10n\.(?:t|line)\(([^,)]*)/g)) {
    for (const [, key] of argument.matchAll(/"([^"]+)"/g)) keys.add(key)
  }
  return keys
}

/** The Swift in `directory` and below. */
function readSwift(directory) {
  return readdirSync(directory, { recursive: true })
    .filter((name) => name.endsWith('.swift'))
    .map((name) => readFileSync(join(directory, name), 'utf8'))
    .join('\n')
}

function main() {
  const check = process.argv.includes('--check')
  let drift = false

  function sync(to, contents) {
    const target = join(repo, to)
    const current = existsSync(target) ? readFileSync(target) : null
    if (current && current.equals(Buffer.from(contents))) return
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

  // --- Watch and Siri string catalogs ---

  const keys = JSON.parse(
    readFileSync(join(repo, 'src/app/watch/watchStringKeys.json'), 'utf8')
  )
  const locales = readLocales(join(repo, 'src/locales'))

  sync(
    'targets/watch/Localizable.xcstrings',
    stringCatalog(locales, [...keys.strings, ...keys.intentStrings])
  )
  // The complications bundle only the few strings they show.
  const unlisted = [
    ...l10nKeys(readSwift(join(repo, 'targets/watch-widgets'))),
  ].filter((key) => !keys.widgetStrings.includes(key))
  if (unlisted.length) {
    throw new Error(
      `targets/watch-widgets uses ${unlisted.join(', ')}; list them under widgetStrings in src/app/watch/watchStringKeys.json`
    )
  }
  sync(
    'targets/watch-widgets/Localizable.xcstrings',
    stringCatalog(locales, keys.widgetStrings)
  )
  sync(
    'targets/intents/Localizable.xcstrings',
    stringCatalog(locales, keys.intentStrings)
  )

  const shortcuts = shortcutCatalog(
    locales,
    keys.shortcutPhrases,
    readFileSync(join(repo, 'targets/intents/ServiceShortcuts.swift'), 'utf8')
  )
  if (shortcuts.problems.length) {
    console.error(`Siri phrases:\n- ${shortcuts.problems.join('\n- ')}`)
    process.exit(1)
  }
  sync('targets/watch/AppShortcuts.xcstrings', shortcuts.catalog)
  sync('targets/intents/AppShortcuts.xcstrings', shortcuts.catalog)

  if (check && drift) {
    console.error('\nRun: pnpm sync:widget-shared')
    process.exit(1)
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
