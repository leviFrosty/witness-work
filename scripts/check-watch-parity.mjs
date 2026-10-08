#!/usr/bin/env node
// Checks the Apple Watch ↔ Wear OS feature registry, docs/watch/features.json
// (see docs/watch/README.md):
//
// - every feature has a stable id, a description, and an entry for both
//   watches with a known status;
// - an implemented or partial feature names where it's implemented on that
//   watch, and anything short of implemented says why;
// - every referenced file exists, and a `path#text` reference still contains
//   that text (a type or function name), so renames can't go unnoticed;
// - every source file of either watch app (and of src/app/watch) belongs to
//   some feature, so a new file means a registry update.
//
// Runs in vitest (scripts/check-watch-parity.test.ts) and pre-commit.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
export const REGISTRY = 'docs/watch/features.json'

export const PLATFORMS = ['watchos', 'wearos']
const STATUSES = ['implemented', 'partial', 'gap', 'not-applicable']
const NEEDS_PATHS = ['implemented', 'partial']
const NEEDS_NOTES = ['partial', 'gap', 'not-applicable']
const ID = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** Files matching `dir/*.ext`, `dir/*` or `dir/**\/*.ext`, relative to `root`. */
export function expand(root, pattern) {
  const recursive = pattern.includes('/**/')
  const [base, rest] = recursive
    ? pattern.split('/**/')
    : [dirname(pattern), pattern.slice(dirname(pattern).length + 1)]
  const suffix = rest.replace(/^\*/, '')
  const directory = join(root, base)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { recursive, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) =>
      relative(root, join(entry.parentPath ?? entry.path, entry.name))
    )
    .sort()
}

/** `path#text` → the file and the text it must contain. */
function parse(reference) {
  const index = reference.indexOf('#')
  return index < 0
    ? { file: reference, text: null }
    : { file: reference.slice(0, index), text: reference.slice(index + 1) }
}

/** What's wrong with `registry`, read against the files under `root`. */
export function checkRegistry(registry, root = repo) {
  const problems = []
  const referenced = new Set()
  const contents = new Map()
  const read = (file) => {
    if (!contents.has(file))
      contents.set(file, readFileSync(join(root, file), 'utf8'))
    return contents.get(file)
  }
  const checkReference = (where, reference) => {
    const { file, text } = parse(reference)
    referenced.add(file)
    if (!existsSync(join(root, file))) {
      problems.push(`${where}: ${file} doesn't exist`)
    } else if (text && !read(file).includes(text)) {
      problems.push(`${where}: ${file} no longer contains "${text}"`)
    }
  }

  const features = registry.features
  if (!Array.isArray(features) || !features.length) {
    return [`${REGISTRY} has no features`]
  }
  const ids = new Set()
  for (const feature of features) {
    const id = feature.id
    if (typeof id !== 'string' || !ID.test(id)) {
      problems.push(
        `feature ${JSON.stringify(id)}: id must look like area.name`
      )
    } else if (ids.has(id)) {
      problems.push(`${id}: id is used twice`)
    }
    ids.add(id)
    for (const field of ['area', 'title', 'description']) {
      if (typeof feature[field] !== 'string' || !feature[field].trim()) {
        problems.push(`${id}: needs a ${field}`)
      }
    }
    for (const reference of feature.shared ?? []) {
      checkReference(`${id} (shared)`, reference)
    }
    for (const platform of PLATFORMS) {
      const entry = feature[platform]
      const where = `${id} (${platform})`
      if (!entry || typeof entry !== 'object') {
        problems.push(`${where}: missing; say how it's implemented or why not`)
        continue
      }
      if (!STATUSES.includes(entry.status)) {
        problems.push(
          `${where}: status must be one of ${STATUSES.join(', ')}, not ${JSON.stringify(entry.status)}`
        )
      }
      const paths = entry.paths ?? []
      if (NEEDS_PATHS.includes(entry.status) && !paths.length) {
        problems.push(
          `${where}: ${entry.status} needs the paths that implement it`
        )
      }
      if (
        NEEDS_NOTES.includes(entry.status) &&
        !(typeof entry.notes === 'string' && entry.notes.trim())
      ) {
        problems.push(`${where}: ${entry.status} needs notes saying why`)
      }
      for (const reference of paths) checkReference(where, reference)
    }
  }

  for (const [platform, references] of Object.entries(
    registry.infrastructure ?? {}
  )) {
    for (const reference of references) {
      checkReference(`infrastructure (${platform})`, reference)
    }
  }

  for (const [platform, patterns] of Object.entries(registry.sources ?? {})) {
    for (const pattern of patterns) {
      for (const file of expand(root, pattern)) {
        if (!referenced.has(file)) {
          problems.push(
            `${file} (${platform}) isn't part of any feature in ${REGISTRY}; add it to the features it implements, or to infrastructure`
          )
        }
      }
    }
  }
  return problems
}

function main() {
  const registry = JSON.parse(readFileSync(join(repo, REGISTRY), 'utf8'))
  const problems = checkRegistry(registry)
  if (problems.length) {
    console.error(
      `Watch parity (${REGISTRY}):\n- ${problems.join('\n- ')}\n\nSee docs/watch/README.md.`
    )
    process.exit(1)
  }
  const counts = {}
  for (const feature of registry.features) {
    for (const platform of PLATFORMS) {
      const key = `${platform} ${feature[platform].status}`
      counts[key] = (counts[key] ?? 0) + 1
    }
  }
  console.log(
    `Watch parity: ${registry.features.length} features. ${Object.entries(
      counts
    )
      .map(([key, count]) => `${key}: ${count}`)
      .join(', ')}`
  )
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
}
