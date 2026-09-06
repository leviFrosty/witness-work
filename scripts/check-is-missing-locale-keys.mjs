#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory =
  process.argv[2] || fileURLToPath(new URL('../src/locales/', import.meta.url))

function filledStrings(value, segments = []) {
  if (typeof value === 'string') return value.trim() ? [[segments, value]] : []
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    filledStrings(child, [...segments, key])
  )
}

try {
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
  const required = filledStrings(read('en-US.json'))
  if (!required.length) throw new Error('en-US.json contains no filled strings')
  const locales = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json') && name !== 'en-US.json')
    .sort()
  if (!locales.length) throw new Error('No target locales found')
  let missing = 0
  for (const locale of locales) {
    const translated = read(locale)
    const keys = required
      .filter(([segments]) => {
        const value = segments.reduce(
          (node, key) =>
            node && typeof node === 'object' && Object.hasOwn(node, key)
              ? node[key]
              : undefined,
          translated
        )
        return typeof value !== 'string' || !value.trim()
      })
      .map(([segments]) => segments.join('.'))
    missing += keys.length
    if (keys.length)
      console.error(
        `${locale}: ${keys.length} missing/empty strings\n  ${keys.join('\n  ')}`
      )
  }
  if (missing) process.exitCode = 1
  else
    console.log(
      `All ${locales.length} locales contain ${required.length} filled English keys.`
    )
} catch (error) {
  console.error(`Locale validation failed: ${error.message}`)
  process.exitCode = 1
}
