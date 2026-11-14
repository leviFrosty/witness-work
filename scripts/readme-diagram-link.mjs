#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const readmePath = fileURLToPath(new URL('../readme.md', import.meta.url))
const check = process.argv.includes('--check')

const readme = readFileSync(readmePath, 'utf8')
const diagram = readme.match(/```mermaid\n([\s\S]*?)```/)
if (!diagram) {
  console.error('readme.md has no mermaid diagram.')
  process.exit(1)
}

const state = JSON.stringify({
  code: diagram[1],
  mermaid: JSON.stringify({ theme: 'default' }),
  autoSync: true,
  updateDiagram: true,
})
const link = `https://mermaid.live/view#pako:${deflateSync(state, { level: 9 }).toString('base64url')}`

const linkPattern = /\[Open the diagram in Mermaid Live\]\([^)]*\)/
if (!linkPattern.test(readme)) {
  console.error('readme.md has no "Open the diagram in Mermaid Live" link.')
  process.exit(1)
}
const updated = readme.replace(
  linkPattern,
  `[Open the diagram in Mermaid Live](${link})`
)

if (updated === readme) process.exit(0)
if (check) {
  console.error(
    'readme.md: the Mermaid Live link is out of date. Run `node scripts/readme-diagram-link.mjs`.'
  )
  process.exit(1)
}
writeFileSync(readmePath, updated)
console.log('readme.md: updated the Mermaid Live link.')
