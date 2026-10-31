// Sums up the CSP and Trusted Types violations a `WW_WEB_CSP` run saved
// (fixtures.ts), as a Markdown table: each distinct violation, and the
// browsers and sizes that reported it.
//
//   node e2e/web/csp-summary.mjs <folder> [<folder> …]
import fs from 'node:fs'
import path from 'node:path'

const folders = process.argv.slice(2)
if (folders.length === 0) {
  console.error('Usage: node e2e/web/csp-summary.mjs <folder> [<folder> …]')
  process.exit(1)
}

// Where a violation came from, without the build's content hash.
const where = (source) =>
  source
    ? path
        .basename(new URL(source, 'http://x').pathname)
        .replace(/-[0-9a-f]{32}/, '')
        .replace(/:\d+:\d+$/, '')
    : ''

const seen = new Map()
const projects = new Set()
for (const folder of folders)
  for (const project of fs.readdirSync(folder)) {
    const directory = path.join(folder, project)
    if (!fs.statSync(directory).isDirectory()) continue
    projects.add(project)
    for (const file of fs.readdirSync(directory)) {
      const violations = JSON.parse(
        fs.readFileSync(path.join(directory, file), 'utf8')
      )
      for (const { directive, blocked, source, sample } of violations) {
        const target =
          directive === 'require-trusted-types-for'
            ? `sink \`${sample}\``
            : /^https?:/.test(blocked)
              ? new URL(blocked).origin
              : blocked
        const key = `${directive} ${target}`
        const entry = seen.get(key) ?? {
          directive,
          target,
          projects: new Set(),
          sources: new Set(),
          tests: new Set(),
        }
        entry.projects.add(project)
        if (where(source)) entry.sources.add(where(source))
        entry.tests.add(file)
        seen.set(key, entry)
      }
    }
  }

console.log(`Projects: ${[...projects].sort().join(', ')}\n`)
console.log('| Violation | Reported by | Source |')
console.log('| --- | --- | --- |')
for (const entry of [...seen.values()].sort((a, b) =>
  `${a.directive}${a.target}`.localeCompare(`${b.directive}${b.target}`)
))
  console.log(
    `| \`${entry.directive}\` ${entry.target} | ${[...entry.projects].sort().join(', ')} | ${[...entry.sources].join(', ')} |`
  )
if (seen.size === 0) console.log('| none | | |')
