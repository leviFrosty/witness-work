#!/usr/bin/env node
/**
 * Lists `src/locales/en-US.json` keys that nothing references, so they can be
 * deleted from every locale before the release cut translates them again.
 *
 * A key counts as used when any tracked source or config file (not locales or
 * docs) mentions it as a whole word, or when a template literal could build it
 * (`faq_${id}_q` keeps every `faq_…` key). Plural forms (`_one`, `_other`, …)
 * count through their base key. It errs toward keeping keys, so a key it lists
 * is very likely dead, but check one before deleting it.
 *
 * Usage: `pnpm check:unused-locales` (exits 1 when it finds any).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const PLURAL = ['zero', 'one', 'two', 'few', 'many', 'other']
const SKIP =
  /^(src\/locales\/|docs\/)|\.(md|png|jpe?g|gif|webp|ttf|otf|mp3|wav|zip|riv|lottie)$|\.xcstrings$|strings\.xml$|\.lproj\//

const english = JSON.parse(fs.readFileSync('src/locales/en-US.json', 'utf8'))

/** Every leaf key, with plural maps (`{ one, other }`) as one key. */
const keys = []
const walk = (object, prefix) => {
  for (const [name, value] of Object.entries(object)) {
    const key = prefix + name
    const isPluralMap =
      value &&
      typeof value === 'object' &&
      Object.keys(value).every((k) => PLURAL.includes(k))
    if (value && typeof value === 'object' && !isPluralMap) {
      walk(value, `${key}.`)
    } else {
      keys.push(key)
    }
  }
}
walk(english, '')

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && !SKIP.test(file))
const source = files
  .map((file) => {
    try {
      return fs.readFileSync(file, 'utf8')
    } catch {
      return ''
    }
  })
  .join('\n')

const prefixes = [...source.matchAll(/`([A-Za-z0-9_.]{3,})\$\{/g)].map(
  (m) => m[1]
)
const suffixes = [...source.matchAll(/\}([A-Za-z0-9_.]{3,})`/g)].map(
  (m) => m[1]
)
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentioned = (key) =>
  new RegExp(`(?<![A-Za-z0-9_])${escape(key)}(?![A-Za-z0-9_])`).test(source)

const unused = keys.filter((key) => {
  const base = key.replace(new RegExp(`_(${PLURAL.join('|')})$`), '')
  if (mentioned(key) || mentioned(base)) return false
  if (prefixes.some((prefix) => key.startsWith(prefix))) return false
  if (suffixes.some((suffix) => key.endsWith(suffix))) return false
  return true
})

if (unused.length) {
  console.log(`${unused.length} unused locale keys:\n${unused.join('\n')}`)
  process.exit(1)
}
console.log(`All ${keys.length} locale keys are referenced.`)
