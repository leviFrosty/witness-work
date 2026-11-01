import { execFileSync } from 'node:child_process'
import { readFile, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { format, resolveConfig } from 'prettier'
import {
  sourceExtensions,
  stripSourceComments,
} from './lib/source-comments.mjs'

const args = process.argv.slice(2)
if (
  args.some((arg) => !['--write', '--check'].includes(arg)) ||
  args.length > 1
)
  throw new Error('Usage: node scripts/strip-comments.mjs [--write|--check]')

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim()
const files = [
  ...new Set(
    execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      }
    )
      .split('\0')
      .filter((filename) => sourceExtensions.test(filename))
  ),
]
const changes = []
let count = 0
for (const filename of files) {
  const absolute = path.join(root, filename)
  const stat = await lstat(absolute).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!stat?.isFile()) continue
  const original = await readFile(absolute, 'utf8')
  const stripped = stripSourceComments(original, filename)
  if (!stripped.count) continue
  const source = await format(stripped.source, {
    ...(await resolveConfig(absolute)),
    filepath: absolute,
  })
  changes.push({ filename, absolute, source })
  count += stripped.count
}

if (args.includes('--write')) {
  for (const change of changes) await writeFile(change.absolute, change.source)
}
for (const change of changes) console.log(change.filename)
console.log(
  `${args.includes('--write') ? 'Removed' : 'Found'} ${count} comments in ${changes.length} files (${files.length} source files scanned).`
)
if (args.includes('--check') && count) process.exitCode = 1
