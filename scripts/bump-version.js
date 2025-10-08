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

// Get bump type from command line argument
const bumpType = process.argv[2]
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  error('Invalid bump type. Use: major, minor, or patch')
}

// Paths
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

console.log('')
warning('📝 REMINDER: Update release notes manually!')
info(`   1. Add new entry to ${releaseNotesPath}`)
info(`   2. Add corresponding i18n keys to locale files (en.json, etc.)`)
console.log('')

// Git commit and tag
try {
  execSync('git add package.json app.config.ts', {
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
} catch (e) {
  error(`Failed to create git commit/tag: ${e.message}`)
}

console.log('')
success(`🎉 Version bumped from ${currentVersion} to ${newVersion}`)
