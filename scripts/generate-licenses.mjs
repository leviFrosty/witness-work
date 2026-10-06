#!/usr/bin/env node

/**
 * Writes the open-source packages WitnessWork ships with, for Settings → About
 * → Open Source Licenses. Run `pnpm licenses:generate` after changing
 * dependencies.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(
  new URL(
    '../src/features/settings/constants/openSourceLicenses.json',
    import.meta.url
  )
)

const raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

const authorName = (author) => {
  if (!author) return undefined
  if (typeof author === 'object') return author.name
  // "Name <email> (url)" → "Name"; never ship maintainers' email addresses.
  return author
    .replace(/\s*<[^>]*>/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
}

const packages = Object.values(JSON.parse(raw))
  .flat()
  .flatMap(({ name, versions, license, author }) =>
    versions.map((version) => {
      const entry = { name, version, license }
      const authorLabel = authorName(author)
      if (authorLabel) entry.author = authorLabel
      return entry
    })
  )
  .filter(({ name }) => name !== 'witness-work')
  .sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'en') ||
      a.version.localeCompare(b.version, 'en', { numeric: true })
  )

fs.writeFileSync(output, `${JSON.stringify(packages, null, 2)}\n`)
console.log(`Wrote ${packages.length} packages to ${output}`)
