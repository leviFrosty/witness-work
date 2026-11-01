#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cardinals from 'make-plural/cardinals'
import * as pluralCategories from 'make-plural/pluralCategories'
import * as pluralExamples from 'make-plural/examples'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const localeDir = path.join(repo, 'src/locales')
const SOURCE = 'en-US'
const PLURAL_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other']
const PLURAL_FORMS = new Set(PLURAL_ORDER)
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

const isPluralNode = (node) =>
  isObject(node) &&
  Object.keys(node).length > 0 &&
  Object.keys(node).every((form) => PLURAL_FORMS.has(form))

const pluralRules = new Map()

const NOUN_CARRIES_COUNT = { ar: ['one', 'two'] }

function plurals(name) {
  if (pluralRules.has(name)) return pluralRules.get(name)
  const language = name.split('-')[0]
  const key =
    name === 'pt-PT'
      ? 'pt_PT'
      : Object.hasOwn(cardinals, language)
        ? language
        : 'en'
  const rule = cardinals[key]
  const required = new Set(['other'])
  for (let n = 0; n <= 1000; n++) required.add(rule(n))
  const examples = pluralExamples[key].cardinal
  const info = {
    forms: new Set(['zero', ...pluralCategories[key].cardinal]),
    required,
    examples,
    oneIsOne: (examples.one ?? []).every((n) => Number(n) === 1),
    countOptional: new Set(NOUN_CARRIES_COUNT[language] ?? []),
  }
  pluralRules.set(name, info)
  return info
}

const sample = (numbers = []) =>
  numbers
    .filter((n) => !n.includes('.'))
    .slice(0, 6)
    .join(', ')

function* extraPluralForms(en, name, keyPath = []) {
  if (!isObject(en)) return
  if (isPluralNode(en)) {
    for (const form of plurals(name).required)
      if (!Object.hasOwn(en, form)) yield [keyPath, form, en.other]
    return
  }
  for (const [key, child] of Object.entries(en))
    yield* extraPluralForms(child, name, [...keyPath, key])
}

function* deadKeys(en, strings, keyPath = []) {
  for (const [key, child] of Object.entries(strings)) {
    if (!Object.hasOwn(en, key)) {
      if (!(isPluralNode(en) && PLURAL_FORMS.has(key))) yield [...keyPath, key]
    } else if (isObject(child) && isObject(en[key]))
      yield* deadKeys(en[key], child, [...keyPath, key])
  }
}

function withoutDeadKeys(en, strings) {
  const kept = {}
  for (const [key, child] of Object.entries(strings)) {
    if (!Object.hasOwn(en, key)) {
      if (isPluralNode(en) && PLURAL_FORMS.has(key)) kept[key] = child
    } else
      kept[key] =
        isObject(child) && isObject(en[key])
          ? withoutDeadKeys(en[key], child)
          : child
  }
  return kept
}

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

const withoutOne = (list) => {
  const all = list ? list.split(' ') : []
  return all.map((_, i) => all.filter((__, j) => j !== i).join(' '))
}

function lintStrings(en, strings, name) {
  const issues = new Map()
  const add = (key, problem) =>
    issues.set(key, [...(issues.get(key) ?? []), problem])
  const rules = plurals(name)

  for (const [keyPath, english] of leaves(en)) {
    const text = get(strings, keyPath)
    if (!filled(text)) continue
    const key = keyPath.join('.')
    const form = keyPath.at(-1)
    const pluralNode = get(en, keyPath.slice(0, -1))
    let expected = [tokens(english)]
    if (isPluralNode(pluralNode) && typeof pluralNode.other === 'string') {
      const other = tokens(pluralNode.other)

      if (form === 'one' && !rules.oneIsOne) expected = [other]
      else if (form !== 'zero') expected.push(other)
      if (rules.countOptional.has(form)) expected.push(...withoutOne(other))
    }
    if (!expected.includes(tokens(text)))
      add(
        key,
        form === 'one' && !rules.oneIsOne && expected[0] !== tokens(english)
          ? `placeholders must be exactly: ${expected[0]} ("one" also counts ${sample(rules.examples.one.filter((n) => Number(n) !== 1))} in ${name})`
          : `placeholders must be exactly: ${expected[0] || '(none)'}`
      )
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

  ;(function pluralForms(enNode, node, keyPath) {
    if (!isObject(enNode) || !isObject(node)) return
    if (isPluralNode(enNode)) {
      const key = keyPath.join('.')
      for (const [form, text] of Object.entries(node)) {
        if (Object.hasOwn(enNode, form)) continue
        if (!rules.forms.has(form))
          add(
            key,
            `plural form "${form}" never renders; ${name} uses ${[...rules.forms].join(', ')}`
          )
        else if (!filled(text)) add(`${key}.${form}`, 'empty plural form')
        else {
          const other = tokens(enNode.other)
          const allowed = rules.countOptional.has(form)
            ? [other, ...withoutOne(other)]
            : [other]
          if (!allowed.includes(tokens(text)))
            add(
              `${key}.${form}`,
              `placeholders must be exactly: ${other || '(none)'}${allowed.length > 1 ? ' (or without the count)' : ''}`
            )
          if (braces(enNode.other) !== braces(text))
            add(`${key}.${form}`, 'stray { or } outside placeholders')
        }
      }
      for (const form of rules.required)
        if (!Object.hasOwn(enNode, form) && !filled(node[form]))
          add(
            `${key}.${form}`,
            `needs plural form "${form}" (${sample(rules.examples[form])}, …)`
          )
      return
    }
    for (const key of Object.keys(enNode))
      pluralForms(enNode[key], node[key], [...keyPath, key])
  })(en, strings, [])

  if (strings !== en)
    for (const keyPath of deadKeys(en, strings))
      add(keyPath.join('.'), `not in ${SOURCE}.json; run \`prune\``)

  return issues
}

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
  const order = isPluralNode(enNode) ? PLURAL_ORDER : Object.keys(enNode)
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
    const issues = lintStrings(en, strings, name)
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

    for (const [keyPath, form, other] of extraPluralForms(en, name)) {
      const key = [...keyPath, form].join('.')
      const current = get(strings, [...keyPath, form])
      const hint = `${name} plural form "${form}": ${sample(plurals(name).examples[form])}, …`
      if (!filled(current))
        keys[key] = { reason: 'missing', en: other, form: hint }
      else if (issues.has(key))
        keys[key] = {
          reason: 'lint',
          en: other,
          form: hint,
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
    const pluralForm =
      isPluralNode(get(en, keyPath.slice(0, -1))) &&
      plurals(name).forms.has(keyPath.at(-1))
    if (typeof get(en, keyPath) !== 'string' && !pluralForm)
      errors.push(`${key}: not a string in ${SOURCE}.json or a plural form`)
    else if (!filled(text))
      errors.push(`${key}: translation must be a nonempty string`)
    else strings = withValue(strings, en, keyPath, text)
  }
  const issues = lintStrings(en, strings, name)
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
  const english = lintStrings(en, en, SOURCE)
  for (const [keyPath, text] of leaves(en)) {
    const key = keyPath.join('.')
    if (/magic/i.test(text))
      english.set(key, [...(english.get(key) ?? []), 'avoid the word "magic"'])
  }
  let count = 0
  for (const [name, issues] of [
    [SOURCE, english],
    ...targets().map((name) => [name, lintStrings(en, readLocale(name), name)]),
  ])
    for (const [key, problems] of issues)
      for (const problem of problems) {
        console.error(`${name} ${key}: ${problem}`)
        count++
      }
  if (count) fail(`\n${count} problems`)
  console.log('No problems found.')
}

function prune() {
  const en = readLocale(SOURCE)
  let total = 0
  for (const name of targets()) {
    const strings = readLocale(name)
    const count = [...deadKeys(en, strings)].length
    if (!count) continue
    total += count
    if (!flags.dryRun)
      writeJson(
        path.join(localeDir, `${name}.json`),
        withoutDeadKeys(en, strings)
      )
    console.log(`${name}: ${count} keys not in ${SOURCE}.json`)
  }
  console.log(
    flags.dryRun || !total ? `${total} keys to prune.` : `Pruned ${total} keys.`
  )
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

const commands = { todo, apply, lint, prune, terms }
if (!Object.hasOwn(commands, command ?? ''))
  fail(
    'Usage: locales.mjs <todo|apply|lint|prune|terms> (see the header comment)'
  )
commands[command]()
