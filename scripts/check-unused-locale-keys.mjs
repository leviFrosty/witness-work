#!/usr/bin/env node
/**
 * Lists `src/locales/en-US.json` keys that nothing references, so they can be
 * deleted from every locale before the release cut translates them again.
 *
 * A key counts as used when a tracked source or config file (not locales, docs
 * or tests) quotes it (`'total'`, `"total"`), reads it off the English file
 * (`enUS.cameraPermissionPurpose`), or has a template literal that could build
 * it (`faq_${id}_q` keeps `faq_x_q` but not `faq_x_title`). A bare word doesn't
 * count, so a key named like a variable (`sort`, `total`) isn't kept by code
 * that happens to use that name. Plural forms (`_one`, `_other`, …) count
 * through their base key. A key it lists is very likely dead, but check one
 * before deleting it.
 *
 * Usage: `pnpm check:unused-locales` (exits 1 when it finds any).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const PLURAL = ['zero', 'one', 'two', 'few', 'many', 'other']
const SKIP =
  /^(src\/locales\/|docs\/)|\.(md|png|jpe?g|gif|webp|ttf|otf|mp3|wav|zip|riv|lottie)$|\.xcstrings$|strings\.xml$|\.lproj\/|\.test\.|__tests__\//

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
/** Drops `/* … *\/` and `// …` comments, so a key named in prose doesn't count. */
const withoutComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const CODE = /\.(m?[jt]sx?|swift|kt)$/
const source = files
  .map((file) => {
    try {
      const text = fs.readFileSync(file, 'utf8')
      return CODE.test(file) ? withoutComments(text) : text
    } catch {
      return ''
    }
  })
  .join('\n')

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentioned = (key) =>
  new RegExp(
    `['"\`]${escape(key)}['"\`]|\\benUS\\.${escape(key)}(?![A-Za-z0-9_])`
  ).test(source)

/**
 * Each key-shaped template literal (`faq_${id}_q`) as a pattern, with every
 * `${…}` matching any key segment. Templates with under 3 fixed characters
 * (`${a}${b}`) would match every key, so they don't count.
 */
const SEGMENT = '[A-Za-z0-9_.-]+'
const templates = [
  ...new Set(
    [
      ...source.matchAll(
        /`((?:[A-Za-z0-9_.-]*\$\{[^}`]+\})+[A-Za-z0-9_.-]*)`/g
      ),
    ].map((m) => m[1])
  ),
]
  .map((template) => template.split(/\$\{[^}]+\}/))
  .filter((parts) => parts.join('').length >= 3)
  .map((parts) => new RegExp(`^${parts.map(escape).join(SEGMENT)}$`))
const built = (key) => templates.some((pattern) => pattern.test(key))

const unused = keys.filter((key) => {
  const base = key.replace(new RegExp(`_(${PLURAL.join('|')})$`), '')
  return ![key, base].some((k) => mentioned(k) || built(k))
})

if (unused.length) {
  console.log(`${unused.length} unused locale keys:\n${unused.join('\n')}`)
  process.exit(1)
}
console.log(`All ${keys.length} locale keys are referenced.`)
