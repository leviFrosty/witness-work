#!/usr/bin/env node

// Prepare release files deterministically; the invoking agent owns prose and translation.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const semver = require('semver')

const root = path.resolve(__dirname, '..')
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: pnpm bump-version <patch|minor|major> (--notes-file <json> | --skip-notes) --prepare

--notes-file  JSON object {"notes": ["User-facing change"]}, written by the invoking agent.
              An empty notes array creates no in-app announcement.
--skip-notes  Bump package.json and app.config.ts without an announcement.
--prepare     Write files only. Translate, check, commit and tag separately.

Preparation only: the /cut-release skill translates, validates, commits and tags afterward.
Requires a clean tree. Failures preserve files for recovery.
See .agents/skills/cut-release/SKILL.md for the full release workflow.`)
  process.exit(0)
}

try {
  const bump = args.shift()
  if (!['major', 'minor', 'patch'].includes(bump)) {
    throw new Error('Expected patch, minor, or major')
  }
  let notesFile
  let skipNotes = false
  let prepare = false
  while (args.length) {
    const arg = args.shift()
    if (arg === '--notes-file') {
      notesFile = args.shift()
      if (!notesFile || notesFile.startsWith('--'))
        throw new Error('Missing notes file')
    } else if (arg === '--skip-notes') skipNotes = true
    else if (arg === '--prepare') prepare = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!prepare)
    throw new Error(
      'Use --prepare; /cut-release handles translation, checks, commit and tag'
    )
  if (Boolean(notesFile) === skipNotes) {
    throw new Error('Choose exactly one of --notes-file or --skip-notes')
  }
  const notes = notesFile
    ? JSON.parse(fs.readFileSync(notesFile, 'utf8')).notes
    : []
  if (
    !Array.isArray(notes) ||
    notes.some((note) => typeof note !== 'string' || !note.trim())
  ) {
    throw new Error('notes must be an array of nonempty strings (or [])')
  }
  if (git('status', '--porcelain'))
    throw new Error('Commit or stash working changes first')

  const pkg = JSON.parse(read('package.json'))
  const current = pkg.version
  if (!semver.valid(current))
    throw new Error(`Invalid package version: ${current}`)
  const version = semver.inc(current, bump)
  const tag = `v${version}`
  if (git('tag', '--list', tag))
    throw new Error(`Tag ${tag} already exists; resume that release`)

  const app = read('app.config.ts')
  const versionPattern = /\bversion:\s*['"]([\d.]+)['"]/g
  const matches = [...app.matchAll(versionPattern)]
  if (matches.length !== 1 || matches[0][1] !== current) {
    throw new Error('Expected one app.config.ts version matching package.json')
  }
  pkg.version = version
  const changes = new Map([
    ['package.json', JSON.stringify(pkg, null, 2) + '\n'],
    ['app.config.ts', app.replace(versionPattern, `version: '${version}'`)],
  ])
  if (notes.length) {
    const file = 'src/features/updates/constants/releaseNotes.ts'
    const source = read(file)
    const marker = 'export const releaseNotes: ReleaseNote[] = [\n'
    if (!source.includes(marker))
      throw new Error('Release notes insertion marker missing')
    if (source.includes(`version: '${version}'`))
      throw new Error('Release notes version already exists')
    const english = JSON.parse(read('src/locales/en-US.json'))
    const key = version.replaceAll('.', '')
    if (!english.updates || Object.hasOwn(english.updates, key)) {
      throw new Error(
        'Missing updates object or colliding release translation key'
      )
    }
    const keys = notes.map((_, i) => `c${i + 1}`)
    const date = new Date().toISOString().slice(0, 10)
    const entry = `  {\n    version: '${version}',\n    date: moment('${date}').toDate(),\n    content: [${keys.map((key) => `'${key}'`).join(', ')}],\n  },\n`
    english.updates[key] = Object.fromEntries(
      keys.map((key, i) => [key, notes[i]])
    )
    changes.set(file, source.replace(marker, marker + entry))
    changes.set(
      'src/locales/en-US.json',
      JSON.stringify(english, null, 2) + '\n'
    )
  }
  // Validate every input before writing. On failure, preserve partial work for inspection.
  for (const [file, contents] of changes)
    fs.writeFileSync(path.join(root, file), contents)
  console.log(
    `Prepared ${current} → ${version}; ${notes.length} announcement bullets`
  )
} catch (error) {
  console.error(`Release preparation stopped: ${error.message}`)
  console.error(
    'Files and Git history are preserved. Inspect git status/log/tag before resuming.'
  )
  process.exitCode = 1
}
