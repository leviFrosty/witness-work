#!/usr/bin/env node

/**
 * Version Bump Script
 *
 * Bumps the version in package.json and app.config.ts, creates a git commit and
 * tag.
 *
 * Usage: pnpm run bump-version major # 1.36.0 → 2.0.0 pnpm run bump-version
 * minor # 1.36.0 → 1.37.0 pnpm run bump-version patch # 1.36.0 → 1.36.1
 *
 * Options: --skip-notes Skip release notes generation
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { execSync, execFileSync } from 'child_process'
import semver from 'semver'

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function error(message) {
  log(`❌ ${message}`, 'red')
  process.exit(1)
}

function success(message) {
  log(`✅ ${message}`, 'green')
}

function info(message) {
  log(`ℹ️  ${message}`, 'cyan')
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow')
}

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${colors.cyan}bump-version${colors.reset} — Bump the app version, optionally generate release notes, commit, and tag.

${colors.yellow}USAGE${colors.reset}
  pnpm run bump-version <major|minor|patch> [options]

${colors.yellow}ARGUMENTS${colors.reset}
  major          Bump the major version    (e.g. 1.36.0 → 2.0.0)
  minor          Bump the minor version    (e.g. 1.36.0 → 1.37.0)
  patch          Bump the patch version    (e.g. 1.36.0 → 1.36.1)

${colors.yellow}OPTIONS${colors.reset}
  --skip-notes   Skip release notes generation. Only bumps the version in
                 package.json and app.config.ts, commits, and tags. Useful for
                 shipping a quick update without notifying users via in-app
                 release notes.
  -h, --help     Show this help message and exit.

${colors.yellow}WHAT IT DOES${colors.reset}
  1. Updates the version in package.json and app.config.ts.
  2. (Unless --skip-notes) Uses Claude to generate user-facing release notes
     from the git log, lets you review/revise interactively, then updates
     releaseNotes.ts, en-US.json, and runs auto-translate.
  3. Stages all changed files, creates a commit, and an annotated git tag.

${colors.yellow}EXAMPLES${colors.reset}
  pnpm run bump-version minor              # bump + release notes
  pnpm run bump-version patch --skip-notes  # bump only, no release notes

${colors.yellow}PREREQUISITES${colors.reset}
  - Clean git working tree (no uncommitted changes).
  - Claude CLI available on PATH (for release notes generation).
`)
  process.exit(0)
}

const skipNotes = args.includes('--skip-notes')
const bumpType = args.find((a) => !a.startsWith('--'))
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  error('Invalid bump type. Use: major, minor, or patch')
}

const rootDir = path.resolve(__dirname, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const appConfigPath = path.join(rootDir, 'app.config.ts')
const releaseNotesPath = path.join(
  rootDir,
  'src/features/updates/constants/releaseNotes.ts'
)

const enUsPath = path.join(rootDir, 'src/locales/en-US.json')

// Fail fast if the files release-notes generation will write to have moved or
// gone missing — before we burn an LLM call and interactive review.
if (!skipNotes) {
  for (const p of [releaseNotesPath, enUsPath]) {
    if (!fs.existsSync(p)) {
      error(
        `Expected file not found: ${path.relative(rootDir, p)}. ` +
          `Update the path in scripts/bump-version.js, or pass --skip-notes.`
      )
    }
  }
}

// Check if we're in a git repository
try {
  execSync('git rev-parse --git-dir', { cwd: rootDir, stdio: 'ignore' })
} catch (e) {
  error('Not in a git repository')
}

// Check for uncommitted changes
try {
  const status = execSync('git status --porcelain', {
    cwd: rootDir,
    encoding: 'utf-8',
  })
  if (status.trim()) {
    error(
      'You have uncommitted changes. Please commit or stash them before bumping version.'
    )
  }
} catch (e) {
  error('Failed to check git status')
}

// Read and parse package.json
let packageJson
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
} catch (e) {
  error(`Failed to read package.json: ${e.message}`)
}

const currentVersion = packageJson.version
if (!semver.valid(currentVersion)) {
  error(`Invalid current version in package.json: ${currentVersion}`)
}

// Calculate new version
const newVersion = semver.inc(currentVersion, bumpType)
if (!newVersion) {
  error(
    `Failed to calculate new version from ${currentVersion} with bump type ${bumpType}`
  )
}

info(`Current version: ${currentVersion}`)
info(`New version: ${newVersion}`)
console.log('')

// Update package.json
packageJson.version = newVersion
try {
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
  success('Updated package.json')
} catch (e) {
  error(`Failed to update package.json: ${e.message}`)
}

// Update app.config.ts
try {
  let appConfig = fs.readFileSync(appConfigPath, 'utf-8')
  const versionRegex = /version:\s*['"][\d.]+['"]/
  if (!versionRegex.test(appConfig)) {
    error('Could not find version field in app.config.ts')
  }
  appConfig = appConfig.replace(versionRegex, `version: '${newVersion}'`)
  fs.writeFileSync(appConfigPath, appConfig)
  success('Updated app.config.ts')
} catch (e) {
  error(`Failed to update app.config.ts: ${e.message}`)
}

// Release notes preparation
const versionKey = newVersion.replace(/\./g, '')
const today = new Date().toISOString().split('T')[0]

// Gather context for release notes generation
const previousTag = `v${currentVersion}`

let gitLog = ''
try {
  gitLog = execSync(
    `git log ${previousTag}..HEAD --no-merges --pretty=format:'%h %s'`,
    { cwd: rootDir, encoding: 'utf-8' }
  ).trim()
} catch (e) {
  warning('Could not get git log since last tag, using recent commits')
  gitLog = execSync(`git log -20 --no-merges --pretty=format:'%h %s'`, {
    cwd: rootDir,
    encoding: 'utf-8',
  }).trim()
}

// Get previous release notes so Claude knows what users have already seen
let previousNotes = ''
try {
  const enUs = JSON.parse(fs.readFileSync(enUsPath, 'utf-8'))
  if (enUs.updates) {
    const versionKeys = Object.keys(enUs.updates)
      .sort((a, b) => Number(b) - Number(a))
      .slice(0, 3)
    const recent = {}
    versionKeys.forEach((k) => {
      recent[k] = enUs.updates[k]
    })
    previousNotes = JSON.stringify(recent, null, 2)
  }
} catch (e) {
  // non-critical
}

/**
 * Strips markdown code fences from a string. Claude sometimes wraps JSON output
 * in `json ... ` blocks.
 */
function stripMarkdownFences(str) {
  return str
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim()
}

// --- Interactive release notes generation ---

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve))
}

const basePrompt = `You are writing release notes for Witness Work, a mobile app. You are generating notes for version ${newVersion}, shipping everything since v${currentVersion}.

CONTEXT — PREVIOUS RELEASE NOTES (what users have already seen):
${previousNotes || '(none available)'}

GIT LOG (all commits since v${currentVersion}):
${gitLog}

INSTRUCTIONS:
1. Before writing, investigate whether features are NEW or improvements to existing ones. Use \`git diff ${previousTag}..HEAD -- <path>\` to check specific files/areas when the commit messages are ambiguous. Check the diff against the previous tag to understand if code is being added fresh or modified. Only label something "New:" if it did not exist before this release.
2. Group related commits into a single bullet. All commits toward one feature = one bullet describing the end result.
3. Cross-reference the PREVIOUS RELEASE NOTES above. If a feature was already announced in a prior version, describe the change as an improvement/enhancement, not as "New:".
4. Filter out: chore:, ci:, build(deps):, test:, refactors with no user-visible behavior change.
5. Write plain, benefit-framed sentences matching this tone:
   - "New: Share Contacts and easily import them. Transferring calls is now easier than ever."
   - "You can now customize the colors of the pins on the map."
   - "Resolved issue where day sheet would not close automatically when adding time."
6. Prefer fewer, richer bullets. Aim for 3-8 bullets.

OUTPUT: ONLY valid JSON, no markdown fences, no explanation:
{"notes": ["Bullet 1", "Bullet 2"]}

If no user-facing changes exist, output: {"notes": ["Bug fixes and performance improvements."]}`

/**
 * Extracts the `notes` array from a chunk of text that should contain
 * `{"notes": [...]}`. Tolerates surrounding prose and markdown fences — Claude
 * occasionally prefixes JSON with an explanation ("I'll ...") despite being
 * asked not to.
 */
function extractNotesFromText(text) {
  const cleaned = stripMarkdownFences(text)

  // Happy path: the whole thing is the JSON object.
  try {
    const obj = JSON.parse(cleaned)
    if (Array.isArray(obj.notes)) return obj.notes
  } catch {
    // fall through to regex extraction
  }

  // Fallback: pull the first {...} block that mentions "notes".
  const match = cleaned.match(/\{[\s\S]*"notes"[\s\S]*\}/)
  if (match) {
    try {
      const obj = JSON.parse(match[0])
      if (Array.isArray(obj.notes)) return obj.notes
    } catch {
      // fall through
    }
  }

  return null
}

function parseClaudeNotes(claudeOutput) {
  // With `--output-format json` the CLI wraps the answer in an envelope
  // ({ type, result, ... }); the model's actual reply lives in `result`.
  let resultText = claudeOutput
  try {
    const envelope = JSON.parse(claudeOutput)
    if (typeof envelope.result === 'string') {
      resultText = envelope.result
    } else if (Array.isArray(envelope.notes)) {
      return envelope.notes
    }
  } catch {
    // Not an envelope — treat the raw output as the reply text.
  }

  const notes = extractNotesFromText(resultText)
  if (!notes) {
    throw new Error(
      `Could not parse notes from Claude output: ${resultText.slice(0, 200)}`
    )
  }
  return notes
}

/**
 * Invokes the Claude CLI via execFileSync (no shell) so the prompt — which
 * contains backticks, `$`, and other shell metacharacters — is passed verbatim
 * as a single argv entry instead of being interpreted by /bin/sh.
 */
function callClaude(promptText) {
  return execFileSync(
    'claude',
    [
      '-p',
      promptText,
      '--model',
      'opus',
      '--output-format',
      'json',
      '--allowedTools',
      'Bash',
      'Read',
    ],
    {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    }
  ).trim()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Calls Claude and parses the release notes, retrying on failure (CLI errors,
 * timeouts, or unparseable output). Returns a non-empty notes array.
 */
async function generateNotesWithRetry(promptText, { retries = 3 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const output = callClaude(promptText)
      const notes = parseClaudeNotes(output)
      if (!Array.isArray(notes) || notes.length === 0) {
        throw new Error('Claude returned an empty notes array')
      }
      return notes
    } catch (e) {
      lastError = e
      if (attempt < retries) {
        const delayMs = attempt * 3000
        warning(`Claude attempt ${attempt}/${retries} failed: ${e.message}`)
        info(`Retrying in ${delayMs / 1000}s...`)
        await sleep(delayMs)
      }
    }
  }
  throw new Error(
    `Claude generation failed after ${retries} attempts: ${lastError.message}`
  )
}

function displayNotes(notes) {
  console.log('')
  log('📋 Proposed release notes:', 'blue')
  notes.forEach((n, i) => info(`   c${i + 1}: ${n}`))
  console.log('')
}

async function generateAndReviewNotes() {
  if (!gitLog) {
    warning('No commits found for release notes. Skipping auto-generation.')
    return null
  }

  let notes
  let currentPrompt = basePrompt

  // Initial generation
  info('Generating release notes with Claude...')
  notes = await generateNotesWithRetry(currentPrompt)

  // Review loop

  while (true) {
    displayNotes(notes)

    const answer = await prompt(
      '  Accept these notes? [Y]es / [n]o, provide feedback: '
    )
    const trimmed = answer.trim()

    // Accept: empty, y, yes (case-insensitive)
    if (!trimmed || /^y(es)?$/i.test(trimmed)) {
      success('Release notes accepted')
      break
    }

    // User provided feedback — send it back to Claude
    const feedback = trimmed.replace(/^no?,?\s*/i, '').trim() || trimmed
    info('Revising release notes with your feedback...')

    const revisionPrompt = `${basePrompt}

PREVIOUS ATTEMPT (rejected by reviewer):
${JSON.stringify(notes)}

REVIEWER FEEDBACK — apply these changes:
${feedback}`

    try {
      notes = await generateNotesWithRetry(revisionPrompt)
    } catch (e) {
      warning(`Revision failed: ${e.message}`)
      warning('Keeping previous version. You can try again.')
    }
  }

  return notes
}

// Run the interactive flow
try {
  let notes = null
  if (skipNotes) {
    info('Skipping release notes generation (--skip-notes)')
  } else {
    notes = await generateAndReviewNotes()
  }
  rl.close()

  let releaseNotesGenerated = false

  if (notes) {
    // Build content keys array
    const contentKeys = notes.map((_, i) => `'c${i + 1}'`).join(', ')

    // 1. Update releaseNotes.ts — prepend new entry
    const releaseNotesContent = fs.readFileSync(releaseNotesPath, 'utf-8')
    const insertMarker = 'export const releaseNotes: ReleaseNote[] = [\n'
    if (!releaseNotesContent.includes(insertMarker)) {
      error('Could not find insertion point in releaseNotes.ts')
    }
    const newEntry = `  {\n    version: '${newVersion}',\n    date: moment('${today}').toDate(),\n    content: [${contentKeys}],\n  },\n`
    const updatedReleaseNotes = releaseNotesContent.replace(
      insertMarker,
      insertMarker + newEntry
    )
    fs.writeFileSync(releaseNotesPath, updatedReleaseNotes)
    success('Updated releaseNotes.ts')

    // 2. Update en-US.json — add i18n keys under "updates"
    const enUsContent = JSON.parse(fs.readFileSync(enUsPath, 'utf-8'))
    if (!enUsContent.updates) {
      error('Could not find "updates" key in en-US.json')
    }
    const i18nEntry = {}
    notes.forEach((note, i) => {
      i18nEntry[`c${i + 1}`] = note
    })
    enUsContent.updates[versionKey] = i18nEntry
    fs.writeFileSync(enUsPath, JSON.stringify(enUsContent, null, 2) + '\n')
    success('Updated en-US.json')

    // 3. Run auto-translate
    info('Running auto-translate...')
    try {
      execSync('pnpm translate --force', {
        cwd: rootDir,
        stdio: 'inherit',
        timeout: 300000,
      })
      success('Auto-translate complete')
    } catch (e) {
      warning(
        `Auto-translate failed (${e.message}). You can re-run: pnpm translate --force`
      )
    }

    releaseNotesGenerated = true
  }

  // Git commit and tag — only after release notes are accepted
  const filesToAdd = ['package.json', 'app.config.ts']
  if (releaseNotesGenerated) {
    filesToAdd.push('src/constants/releaseNotes.ts', 'src/locales/')
  }
  execSync(`git add ${filesToAdd.join(' ')}`, {
    cwd: rootDir,
    stdio: 'inherit',
  })
  execSync(`git commit -m "chore: bump version to ${newVersion}"`, {
    cwd: rootDir,
    stdio: 'inherit',
  })
  success(`Created commit: "chore: bump version to ${newVersion}"`)

  const tagName = `v${newVersion}`
  execSync(`git tag -a ${tagName} -m "Release ${newVersion}"`, {
    cwd: rootDir,
    stdio: 'inherit',
  })
  success(`Created annotated tag: ${tagName}`)

  console.log('')
  info('Next steps:')
  info(`   git push origin main --follow-tags`)
  info(`   → This will trigger the production build workflow`)

  console.log('')
  success(`🎉 Version bumped from ${currentVersion} to ${newVersion}`)
} catch (e) {
  rl.close()
  warning(`Release notes generation failed: ${e.message}`)
  warning('Reverting version file changes...')
  try {
    execSync('git checkout -- .', { cwd: rootDir, stdio: 'inherit' })
    success('Reverted changes. No commit or tag created.')
  } catch (revertErr) {
    warning(`Failed to revert: ${revertErr.message}. Please check git status.`)
  }
  process.exit(1)
}
