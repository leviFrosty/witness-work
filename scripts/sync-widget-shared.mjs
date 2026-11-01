#!/usr/bin/env node

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
    from: 'targets/intents',
    to: ['targets/watch/Shared'],
    files: ['ServiceIntents.swift', 'ServiceShortcuts.swift'],
  },
  {
    from: 'modules/watch-bridge/android/src/main/java/com/leviwilkerson/witnesswork/watchprotocol',
    to: [
      'targets/wear-os/src/main/java/com/leviwilkerson/witnesswork/watchprotocol',
    ],
    files: ['WatchProtocol.kt'],
  },
  {
    from: 'modules/watch-bridge/android/src/test/resources',
    to: ['targets/wear-os/src/test/resources'],
    files: ['phone-context.json'],
  },
  {
    from: 'targets/watch',
    to: ['targets/watch-widgets/Shared', 'targets/widgets/Shared'],
    files: ['AppLanguage.swift'],
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

const nativeLanguages = JSON.parse(
  readFileSync(join(here, 'native-languages.json'), 'utf8')
)
const languageFiles = Object.keys(nativeLanguages).filter(
  (file) => !file.startsWith('$')
)

const appleLanguages = Object.fromEntries(
  languageFiles.map((file) => [file, nativeLanguages[file].apple])
)

const androidQualifiers = Object.fromEntries(
  languageFiles.map((file) => [file, nativeLanguages[file].android])
)

function lookup(strings, key) {
  if (typeof strings[key] === 'string') return strings[key]
  const value = key.split('.').reduce((node, part) => node?.[part], strings)
  return typeof value === 'string' ? value : undefined
}

function translation(strings, key) {
  const value = lookup(strings, key)
  return value?.trim() ? value : undefined
}

export function readLocales(directory) {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
  const unmapped = files.filter(
    (file) => !appleLanguages[file] || androidQualifiers[file] === undefined
  )
  if (unmapped.length) {
    throw new Error(
      `Add ${unmapped.join(', ')} to scripts/native-languages.json`
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
const PLACEHOLDER = /\$\{(\w+)\}/g
const SWIFT_PLACEHOLDER = /\\\((?:\.applicationName|\\\.\$(\w+))\)/g

const swiftPhrase = (phrase) =>
  phrase.replace(PLACEHOLDER, (placeholder, name) =>
    placeholder === APP_NAME ? '\\(.applicationName)' : `\\(\\.$${name})`
  )
const placeholders = (phrase) =>
  [...phrase.matchAll(PLACEHOLDER)].map(([placeholder]) => placeholder)

export function shortcutCatalog(locales, phraseKeys, shortcutsSwift) {
  const problems = []
  const englishPhrases = new Set()
  const strings = {}
  for (const key of phraseKeys) {
    const phrase = english(locales, key)
    englishPhrases.add(phrase)
    const swiftLiteral = `"${swiftPhrase(phrase)}"`
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

  for (const [, literal] of shortcutsSwift.matchAll(/"([^"\n]*)"/g)) {
    if (!literal.includes('\\(.applicationName)')) continue
    const phrase = literal.replace(SWIFT_PLACEHOLDER, (_, name) =>
      name ? `\${${name}}` : APP_NAME
    )
    if (!englishPhrases.has(phrase)) {
      problems.push(
        `targets/intents/ServiceShortcuts.swift phrase "${literal}" needs a siriShortcut* string in src/locales/en-US.json, listed under shortcutPhrases in src/app/watch/watchStringKeys.json`
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
      const expected = new Set([
        APP_NAME,
        ...placeholders(english(locales, key)),
      ])
      const used = placeholders(value)
      for (const placeholder of expected) {
        if (used.filter((p) => p === placeholder).length !== 1) {
          problem(`needs ${placeholder} exactly once`)
        }
      }
      if (used.some((p) => !expected.has(p)) || /%\{/.test(value)) {
        problem('can only use the placeholders of its English phrase')
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

export function wearKeys(keys) {
  return [
    ...new Set([...keys.strings, ...keys.widgetStrings, ...keys.wearStrings]),
  ]
    .sort()
    .map((key) => ({
      name: key,
      source: keys.androidVariants.includes(key) ? `${key}Android` : key,
    }))
}

function androidString(value) {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
  return /^[@?]/.test(escaped) ? `\\${escaped}` : escaped
}

const GENERATED_XML =
  '<!-- Generated by scripts/sync-widget-shared.mjs from src/locales. Do not edit. -->'

export function wearStringResources(locales, keys) {
  const strings = wearKeys(keys)

  const resources = {}
  for (const [file, values] of Object.entries(locales)) {
    const qualifier = androidQualifiers[file]
    const lines = []
    for (const { name, source } of strings) {
      const value =
        file === 'en-US'
          ? english(locales, source)
          : translation(values, source)
      if (value) {
        lines.push(
          `  <string name="${name}" formatted="false">${androidString(value)}</string>`
        )
      }
    }
    const directory = qualifier ? `values-${qualifier}` : 'values'
    resources[directory] =
      `<?xml version="1.0" encoding="utf-8"?>\n${GENERATED_XML}\n<resources>\n${lines.join('\n')}${lines.length ? '\n' : ''}</resources>\n`
  }
  return resources
}

export function wearBundledStrings(keys) {
  const entries = wearKeys(keys)
    .map(({ name }) => `    "${name}" to R.string.${name},`)
    .join('\n')
  return `// Generated by scripts/sync-widget-shared.mjs from src/app/watch/watchStringKeys.json.
// Do not edit.
package com.leviwilkerson.witnesswork.wear

internal object BundledStrings {
  val ids: Map<String, Int> =
    mapOf(
${entries}
    )
}
`
}

export function kotlinL10nKeys(kotlin) {
  const keys = new Set()
  for (const [, key] of kotlin.matchAll(
    /(?:L10n\.(?:t|line)|\bt)\(\s*"([^"]+)"/g
  )) {
    keys.add(key)
  }
  return keys
}

export function l10nKeys(swift) {
  const keys = new Set()
  for (const [, argument] of swift.matchAll(/L10n\.(?:t|line)\(([^,)]*)/g)) {
    for (const [, key] of argument.matchAll(/"([^"]+)"/g)) keys.add(key)
  }
  return keys
}

export function alertTextKeys(swift) {
  const keys = new Set()
  for (const [, key] of swift.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g))
    keys.add(key)
  for (const [, key] of swift.matchAll(/:\s*"(buddies_[A-Za-z0-9_]+)"/g))
    keys.add(key)
  return keys
}

function readSources(directory, extension) {
  return readdirSync(directory, { recursive: true })
    .filter((name) => name.endsWith(extension))
    .map((name) => readFileSync(join(directory, name), 'utf8'))
    .join('\n')
}

const readSwift = (directory) => readSources(directory, '.swift')

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

  const keys = JSON.parse(
    readFileSync(join(repo, 'src/app/watch/watchStringKeys.json'), 'utf8')
  )
  const locales = readLocales(join(repo, 'src/locales'))

  sync(
    'targets/watch/Localizable.xcstrings',
    stringCatalog(locales, [...keys.strings, ...keys.intentStrings])
  )

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

  const iosWidgetUnlisted = [
    ...l10nKeys(readSwift(join(repo, 'targets/widgets'))),
  ].filter((key) => !keys.iosWidgetStrings.includes(key))
  if (iosWidgetUnlisted.length) {
    throw new Error(
      `targets/widgets uses ${iosWidgetUnlisted.join(', ')}; list them under iosWidgetStrings in src/app/watch/watchStringKeys.json`
    )
  }
  sync(
    'targets/widgets/Localizable.xcstrings',
    stringCatalog(locales, keys.iosWidgetStrings)
  )

  const alertKeys = new Set(keys.notificationStrings)
  const alertUnlisted = [
    ...alertTextKeys(readSwift(join(repo, 'targets/notification-service'))),
  ].filter((key) => !alertKeys.has(key))
  if (alertUnlisted.length) {
    throw new Error(
      `targets/notification-service uses ${alertUnlisted.join(', ')}; list them under notificationStrings in src/app/watch/watchStringKeys.json`
    )
  }
  sync(
    'targets/notification-service/Localizable.xcstrings',
    stringCatalog(locales, keys.notificationStrings)
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

  const missingVariants = keys.androidVariants.filter(
    (key) => !translation(locales['en-US'], `${key}Android`)
  )
  if (missingVariants.length) {
    throw new Error(
      `src/locales/en-US.json needs ${missingVariants.map((key) => `${key}Android`).join(', ')} (androidVariants in src/app/watch/watchStringKeys.json)`
    )
  }
  const wearSources = join(repo, 'targets/wear-os/src/main/java')
  const wearListed = new Set(wearKeys(keys).map(({ name }) => name))
  const wearUnlisted = [
    ...kotlinL10nKeys(readSources(wearSources, '.kt')),
  ].filter((key) => !wearListed.has(key))
  if (wearUnlisted.length) {
    throw new Error(
      `targets/wear-os uses ${wearUnlisted.join(', ')}; list them in src/app/watch/watchStringKeys.json (wearStrings for Wear OS only)`
    )
  }
  for (const [directory, contents] of Object.entries(
    wearStringResources(locales, keys)
  )) {
    sync(
      `targets/wear-os/src/main/res/${directory}/watch_strings.xml`,
      contents
    )
  }
  sync(
    'targets/wear-os/src/main/java/com/leviwilkerson/witnesswork/wear/BundledStrings.kt',
    wearBundledStrings(keys)
  )

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
