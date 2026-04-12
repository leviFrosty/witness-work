#!/usr/bin/env node

/**
 * Version Bump Script
 *
 * Bumps the version in package.json and app.config.ts, creates a git commit and
 * tag.
 *
 * Usage: pnpm run version:bump major # 1.36.0 → 2.0.0 pnpm run version:bump
 * minor # 1.36.0 → 1.37.0 pnpm run version:bump patch # 1.36.0 → 1.36.1
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { execSync } from 'child_process'
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

const bumpType = process.argv[2]
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  error('Invalid bump type. Use: major, minor, or patch')
}

const rootDir = path.resolve(__dirname, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const appConfigPath = path.join(rootDir, 'app.config.ts')
const releaseNotesPath = path.join(rootDir, 'src/constants/releaseNotes.ts')

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

// Generate release notes via Claude CLI
console.log('')
info('Generating release notes with Claude...')

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
  const enUsPath = path.join(rootDir, 'src/locales/en-US.json')
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

function parseClaudeNotes(claudeOutput) {
  const parsed = JSON.parse(claudeOutput)
  if (typeof parsed.result === 'string') {
    const cleaned = stripMarkdownFences(parsed.result)
    return JSON.parse(cleaned).notes
  } else if (parsed.notes) {
    return parsed.notes
  }
  throw new Error(
    `Unexpected Claude output shape: ${claudeOutput.slice(0, 200)}`
  )
}

function callClaude(promptText) {
  return execSync(
    `claude -p ${JSON.stringify(promptText)} --model sonnet --output-format json --allowedTools Bash Read`,
    { cwd: rootDir, encoding: 'utf-8', timeout: 120000 }
  ).trim()
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
  try {
    const output = callClaude(currentPrompt)
    notes = parseClaudeNotes(output)
  } catch (e) {
    throw new Error(`Claude generation failed: ${e.message}`)
  }

  if (!Array.isArray(notes) || notes.length === 0) {
    throw new Error('Claude returned empty notes array')
  }

  // Review loop
  // eslint-disable-next-line no-constant-condition
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
      const output = callClaude(revisionPrompt)
      notes = parseClaudeNotes(output)
    } catch (e) {
      warning(`Revision failed: ${e.message}`)
      warning('Keeping previous version. You can try again.')
    }

    if (!Array.isArray(notes) || notes.length === 0) {
      warning('Claude returned empty notes. Keeping previous version.')
    }
  }

  return notes
}

// Run the interactive flow
try {
  const notes = await generateAndReviewNotes()
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
    const enUsPath = path.join(rootDir, 'src/locales/en-US.json')
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
