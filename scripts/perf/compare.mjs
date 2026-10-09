#!/usr/bin/env node
// Prints a before/after table of two scripts/perf results:
//   node scripts/perf/compare.mjs docs/perf/baseline-<sha>.json docs/perf/after.json [--all] [--out file.md]
import fs from 'node:fs'
import { compareResults, renderComparison } from './stats.mjs'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
const outIndex = args.indexOf('--out')
const out = outIndex >= 0 ? args[outIndex + 1] : null
const inputs = files.filter((f) => f !== out)
if (inputs.length !== 2) {
  console.error(
    'Usage: node scripts/perf/compare.mjs <before.json> <after.json> [--all] [--out file.md]'
  )
  process.exit(1)
}
const [before, after] = inputs.map((f) =>
  JSON.parse(fs.readFileSync(f, 'utf8'))
)
const table = renderComparison(before, after, compareResults(before, after), {
  all: args.includes('--all'),
})
if (out) fs.writeFileSync(out, `${table}\n`)
console.log(table)
