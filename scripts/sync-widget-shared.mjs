#!/usr/bin/env node
// Sync shared Swift sources from the stopwatch-bridge expo module into the
// widget extension target. The module is the source of truth; the widget
// extension gets copies because Xcode/EAS tarball flow does not reliably
// preserve symlinks across the local-build project archive.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const src = join(repo, 'modules/stopwatch-bridge/ios')
const dest = join(repo, 'targets/widgets/Stopwatch')

const files = [
  'StopwatchActivityController.swift',
  'StopwatchAttributes.swift',
  'StopwatchIntents.swift',
  'StopwatchStore.swift',
]

mkdirSync(dest, { recursive: true })

const check = process.argv.includes('--check')
let drift = false

for (const f of files) {
  const from = join(src, f)
  const to = join(dest, f)
  const a = readFileSync(from)
  const b = existsSync(to) ? readFileSync(to) : null
  if (b && a.equals(b)) continue
  if (check) {
    console.error(`drift: ${f}`)
    drift = true
  } else {
    writeFileSync(to, a)
    console.log(`synced: ${f}`)
  }
}

if (check && drift) {
  console.error('\nRun: pnpm sync:widget-shared')
  process.exit(1)
}
