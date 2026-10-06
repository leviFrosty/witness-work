#!/usr/bin/env node
// Helpers for the translate-locales skill (see SKILL.md beside this file).
//
//   todo  [--since <ref>] [--locale <name>]... [--chunk <n>] [--out <dir>]
//   apply <name> <translations.json> [--dry-run]
//   lint  [--locale <name>]...
//   terms <name> <english term>... [--limit <n>]
//
// <name> is a file in src/locales without `.json`, e.g. `ru-RU`.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const localeDir = path.join(repo, 'src/locales')
const SOURCE = 'en-US'
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])
// No pluralizer is registered with i18n-js, so every Language uses English rules.
const RENDERED_FORMS = new Set(['zero', 'one', 'other'])
const TOKEN = /\{\{[^{}]*\}\}|%\{[^{}]*\}|\$\{[^{}]*\}/g

const isObject = (value) => value !== null && typeof value === 'object'
const filled = (value) => typeof value === 'string' && value.trim() !== ''
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const readLocale = (name) => readJson(path.join(localeDir, `${name}.json`))
const get = (node, keyPath) =>
  keyPath.reduce(
    (n, k) => (isObject(n) && Object.hasOwn(n, k) ? n[k] : undefined),
    node
  )

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** Nonempty string leaves, the same set `pnpm check:locales` requires. */
function* leaves(node, keyPath = []) {
  if (typeof node === 'string') {
    if (node.trim()) yield [keyPath, node]
  } else if (isObject(node)) {
    for (const [key, child] of Object.entries(node))
      yield* leaves(child, [...keyPath, key])
  }
}

const [command, ...args] = process.argv.slice(2)
const positional = []
const flags = { locale: [] }
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--dry-run') flags.dryRun = true
  else if (arg.startsWith('--')) {
    const value = args[++i]
    if (value === undefined) fail(`${arg} needs a value`)
    if (arg === '--locale') flags.locale.push(value)
    else flags[arg.slice(2)] = value
  } else positional.push(arg)
}

const allLocales = fs
  .readdirSync(localeDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -'.json'.length))
  .filter((name) => name !== SOURCE)
  .sort()

function checkLocale(name) {
  if (!allLocales.includes(name))
    fail(`Unknown locale "${name}". Choose from: ${allLocales.join(', ')}`)
  return name
}

const targets = () =>
  flags.locale.length ? flags.locale.map(checkLocale) : allLocales

function gitLocale(ref, name) {
  try {
    const text = execFileSync(
      'git',
      ['show', `${ref}:src/locales/${name}.json`],
      {
        cwd: repo,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    )
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function shortcutPhraseKeys() {
  const file = path.join(repo, 'src/app/watch/watchStringKeys.json')
  return fs.existsSync(file) ? (readJson(file).shortcutPhrases ?? []) : []
}

const tokens = (text) => (text.match(TOKEN) ?? []).sort().join(' ')
const braces = (text) => text.replace(TOKEN, '').replace(/[^{}]/g, '').length
const boldMarkers = (text) => text.split('**').length - 1

/** Problems per dotted key in `strings`, checked against English. */
function lintStrings(en, strings) {
  const issues = new Map()
  const add = (key, problem) =>
    issues.set(key, [...(issues.get(key) ?? []), problem])

  for (const [keyPath, english] of leaves(en)) {
    const text = get(strings, keyPath)
    if (!filled(text)) continue
    const key = keyPath.join('.')
    if (tokens(english) !== tokens(text))
      add(key, `placeholders must be exactly: ${tokens(english) || '(none)'}`)
    if (braces(english) !== braces(text))
      add(key, 'stray { or } outside placeholders')
    if (boldMarkers(english) !== boldMarkers(text))
      add(key, `needs ${boldMarkers(english)} ** markers, like English`)
  }

  const phrases = new Map()
  for (const key of shortcutPhraseKeys()) {
    const text = get(strings, key.split('.'))
    if (!filled(text)) continue
    if (text.split('${applicationName}').length !== 2)
      add(key, 'Siri phrase needs ${applicationName} exactly once')
    if (/\p{Nd}/u.test(text)) add(key, 'Siri phrase must not contain digits')
    const spoken = text.trim().toLocaleLowerCase()
    const other = phrases.get(spoken)
    if (other) {
      add(key, `Siri phrase is the same as ${other}`)
      add(other, `Siri phrase is the same as ${key}`)
    } else phrases.set(spoken, key)
  }

  ;(function plurals(enNode, node, keyPath) {
    if (!isObject(enNode) || !isObject(node)) return
    const keys = Object.keys(enNode)
    if (keys.length && keys.every((form) => PLURAL_FORMS.has(form))) {
      for (const form of Object.keys(node))
        if (!RENDERED_FORMS.has(form))
          add(
            keyPath.join('.'),
            `plural form "${form}" never renders; i18n-js only picks zero, one and other`
          )
      return
    }
    for (const key of keys) plurals(enNode[key], node[key], [...keyPath, key])
  })(en, strings, [])

  return issues
}

/** Sets `keyPath` to `value`, inserting new keys beside their English neighbors. */
function withValue(target, enNode, [key, ...rest], value) {
  const child = rest.length
    ? withValue(
        isObject(target[key]) ? target[key] : {},
        enNode[key],
        rest,
        value
      )
    : value
  if (Object.hasOwn(target, key)) {
    target[key] = child
    return target
  }
  const order = Object.keys(enNode)
  const at = order.indexOf(key)
  const before = order
    .slice(0, at)
    .reverse()
    .find((k) => Object.hasOwn(target, k))
  const after = order.slice(at + 1).find((k) => Object.hasOwn(target, k))
  const entries = Object.entries(target)
  const index =
    before !== undefined
      ? entries.findIndex(([k]) => k === before) + 1
      : after !== undefined
        ? entries.findIndex(([k]) => k === after)
        : entries.length
  entries.splice(index, 0, [key, child])
  return Object.fromEntries(entries)
}

function todo() {
  const en = readLocale(SOURCE)
  const since = flags.since
  const enThen = since ? gitLocale(since, SOURCE) : undefined
  if (since && !enThen)
    fail(`Can't read src/locales/${SOURCE}.json at ${since}`)
  const chunk = flags.chunk ? Number(flags.chunk) : Infinity
  if (!(chunk > 0)) fail('--chunk must be a positive number')
  const out = path.resolve(repo, flags.out ?? '.asc/translations')

  let total = 0
  for (const name of targets()) {
    const strings = readLocale(name)
    const stringsThen = since ? gitLocale(since, name) : undefined
    const issues = lintStrings(en, strings)
    const keys = {}
    for (const [keyPath, english] of leaves(en)) {
      const key = keyPath.join('.')
      const current = get(strings, keyPath)
      const was = enThen ? get(enThen, keyPath) : undefined
      if (!filled(current)) keys[key] = { reason: 'missing', en: english }
      else if (
        typeof was === 'string' &&
        was !== english &&
        current === get(stringsThen, keyPath)
      )
        keys[key] = { reason: 'changed', en: english, was, current }
      else if (issues.has(key))
        keys[key] = {
          reason: 'lint',
          en: english,
          current,
          problems: issues.get(key),
        }
    }

    if (fs.existsSync(out))
      for (const file of fs.readdirSync(out))
        if (file.startsWith(`${name}.todo`)) fs.rmSync(path.join(out, file))
    const entries = Object.entries(keys)
    const size = Math.min(chunk, entries.length) || 1
    const parts = Math.ceil(entries.length / size)
    for (let i = 0; i < parts; i++) {
      const suffix = parts > 1 ? `-${String(i + 1).padStart(2, '0')}` : ''
      writeJson(path.join(out, `${name}.todo${suffix}.json`), {
        locale: name,
        since: since ?? null,
        keys: Object.fromEntries(entries.slice(i * size, (i + 1) * size)),
      })
    }
    const reasons = {}
    for (const { reason } of Object.values(keys))
      reasons[reason] = (reasons[reason] ?? 0) + 1
    const summary = Object.entries(reasons)
      .map(([reason, n]) => `${n} ${reason}`)
      .join(', ')
    console.log(
      `${name}: ${entries.length} keys${summary ? ` (${summary}) in ${parts} file${parts > 1 ? 's' : ''}` : ''}`
    )
    total += entries.length
  }
  const shown = out.startsWith(repo) ? path.relative(repo, out) : out
  console.log(total ? `Worklists are in ${shown}/` : 'Nothing to translate.')
}

function apply() {
  const [name, file] = positional
  if (!name || !file) fail('Usage: apply <name> <translations.json>')
  checkLocale(name)
  const en = readLocale(SOURCE)
  const translations = readJson(path.resolve(file))
  if (!isObject(translations) || Array.isArray(translations))
    fail('Translations must be a JSON object of "dotted.key": "text"')

  let strings = readLocale(name)
  const errors = []
  for (const [key, text] of Object.entries(translations)) {
    const keyPath = key.split('.')
    if (typeof get(en, keyPath) !== 'string')
      errors.push(`${key}: not a string in ${SOURCE}.json`)
    else if (!filled(text))
      errors.push(`${key}: translation must be a nonempty string`)
    else strings = withValue(strings, en, keyPath, text)
  }
  const issues = lintStrings(en, strings)
  for (const key of Object.keys(translations))
    for (const problem of issues.get(key) ?? [])
      errors.push(`${key}: ${problem}`)
  if (errors.length) fail(`Nothing applied:\n  ${errors.join('\n  ')}`)

  const count = Object.keys(translations).length
  if (flags.dryRun) console.log(`Valid: ${count} keys for ${name}`)
  else {
    writeJson(path.join(localeDir, `${name}.json`), strings)
    console.log(`Applied ${count} keys to src/locales/${name}.json`)
  }
}

function lint() {
  const en = readLocale(SOURCE)
  const english = lintStrings(en, en)
  for (const [keyPath, text] of leaves(en)) {
    const key = keyPath.join('.')
    if (/magic/i.test(text))
      english.set(key, [...(english.get(key) ?? []), 'avoid the word "magic"'])
  }
  let count = 0
  for (const [name, issues] of [
    [SOURCE, english],
    ...targets().map((name) => [name, lintStrings(en, readLocale(name))]),
  ])
    for (const [key, problems] of issues)
      for (const problem of problems) {
        console.error(`${name} ${key}: ${problem}`)
        count++
      }
  if (count) fail(`\n${count} problems`)
  console.log('No problems found.')
}

function terms() {
  const [name, ...words] = positional
  if (!name || !words.length) fail('Usage: terms <name> <english term>...')
  checkLocale(name)
  const en = readLocale(SOURCE)
  const strings = readLocale(name)
  const limit = Number(flags.limit ?? 12)
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\b${escaped}`, 'i')
    const hits = [...leaves(en)]
      .filter(([keyPath, text]) => {
        return pattern.test(text) && filled(get(strings, keyPath))
      })
      .sort(([, a], [, b]) => a.length - b.length)
    console.log(`\n# "${word}": ${hits.length} translated strings`)
    for (const [keyPath, text] of hits.slice(0, limit))
      console.log(
        `${keyPath.join('.')}\n  en: ${text}\n  ${name}: ${get(strings, keyPath)}`
      )
  }
}

const commands = { todo, apply, lint, terms }
if (!Object.hasOwn(commands, command ?? ''))
  fail('Usage: locales.mjs <todo|apply|lint|terms> (see the header comment)')
commands[command]()
