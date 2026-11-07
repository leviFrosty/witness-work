#!/usr/bin/env node

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = path.resolve(
  import.meta.dirname,
  '../../src/components/landing/i18n'
)

const load = async (name) =>
  (await import(pathToFileURL(path.join(dir, `${name}.ts`)).href)).default

const english = await load('en-US')
const wanted = process.argv.slice(2)
const locales = wanted.length
  ? wanted
  : readdirSync(dir)
      .filter((f) => /^[a-z]{2,3}(-[A-Z]{2})?\.ts$/.test(f) && f !== 'en-US.ts')
      .map((f) => f.slice(0, -3))

const markers = (text) => (text.match(/\*\*/g) ?? []).length

function compare(en, other, at, problems) {
  if (typeof en === 'string') {
    if (typeof other !== 'string') problems.push(`${at}: not a string`)
    else if (!other.trim()) problems.push(`${at}: empty`)
    else if (markers(en) !== markers(other))
      problems.push(
        `${at}: ${markers(other)} ** markers, English has ${markers(en)}`
      )
    return
  }
  if (Array.isArray(en)) {
    if (!Array.isArray(other)) {
      problems.push(`${at}: not a list`)
      return
    }
    if (other.length !== en.length)
      problems.push(`${at}: ${other.length} items, English has ${en.length}`)
    en.forEach((item, i) => compare(item, other[i], `${at}[${i}]`, problems))
    return
  }
  if (!other || typeof other !== 'object') {
    problems.push(`${at}: missing`)
    return
  }
  const enRecord = en
  const otherRecord = other
  for (const key of Object.keys(enRecord))
    compare(
      enRecord[key],
      otherRecord[key],
      at ? `${at}.${key}` : key,
      problems
    )
  for (const key of Object.keys(otherRecord))
    if (!(key in enRecord))
      problems.push(`${at ? `${at}.` : ''}${key}: not in English`)
}

let failed = false
for (const locale of locales) {
  const problems = []
  try {
    const messages = await load(locale)
    if (messages === english) problems.push('still the English placeholder')
    else compare(english, messages, '', problems)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    problems.push(`can't load: ${message.split('\n')[0]}`)
  }
  if (problems.length) {
    failed = true
    console.log(`✗ ${locale}\n  ${problems.join('\n  ')}`)
  } else console.log(`✓ ${locale}`)
}
process.exit(failed ? 1 : 0)
