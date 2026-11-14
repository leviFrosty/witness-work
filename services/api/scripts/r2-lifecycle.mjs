#!/usr/bin/env node
/**
 * Makes sure an R2 bucket exists and carries its lifecycle rules, so a deploy
 * never depends on someone having run them by hand.
 *
 *   node scripts/r2-lifecycle.mjs ww-buddy-blobs           # create if missing, set the rules
 *   node scripts/r2-lifecycle.mjs ww-buddy-blobs --check   # read-only; exit 1 if anything is off
 *   node scripts/r2-lifecycle.mjs ww-account-backups       # the same for account backups
 *   node scripts/r2-lifecycle.mjs ww-account-sync          # and for Cloud Sync
 *   node scripts/r2-lifecycle.mjs ww-account-photos        # and Cloud Sync photos
 *
 * Buddies photo buckets (`ww-buddy-blobs*`): the backstop deletes any object a
 * day past the longest a photo can live (`BUDDIES_LIMITS.maxBlobLifetimeMs`,
 * 90 days). R2 counts an object's age from its last write, and every upload
 * rewrites the object, so the rule never touches a live photo; it only catches
 * objects the relay lost track of.
 *
 * Account backup buckets (`ww-account-backups*`): a slot not uploaded for 400
 * days is deleted (witness-work ADR 0026). Every `backup/put` rewrites the
 * slot's object, which restarts its age.
 *
 * Cloud Sync buckets (`ww-account-sync*`): a slot not written for 400 days is
 * deleted (witness-work ADR 0030), a backstop to the AccountSync DO's own
 * retention, which deletes sooner. Every `sync/put` rewrites the slot.
 *
 * Cloud Sync photo buckets (`ww-account-photos*`): no age rule at all
 * (witness-work ADR 0040). Each photo is written once and kept while its
 * account uses Cloud Sync, so an age rule would delete live photos; the
 * AccountSync DO purges deleted ones. Only the multipart-abort rule is set,
 * and `--check` fails if any expiry rule appears.
 *
 * `lifecycle set` replaces every rule on the bucket, so R2's default
 * multipart-abort rule is restated here too.
 *
 * Needs Cloudflare credentials wrangler can use (`wrangler login`, or
 * CLOUDFLARE_API_TOKEN with R2 edit and CLOUDFLARE_ACCOUNT_ID in CI).
 */
import { spawnSync } from 'node:child_process'
import { stripVTControlCharacters } from 'node:util'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DAY_SECONDS = 24 * 60 * 60

/** `BUDDIES_LIMITS.maxBlobLifetimeMs` in days, plus one (checked by a test). */
export const BACKSTOP_DAYS = 90 + 1
export const BACKSTOP_RULE_ID = 'buddy-blobs-backstop'
export const BLOB_PREFIX = 'v1/'

/** Account backup slots: deleted 400 days after their last upload. */
export const BACKUP_EXPIRY_DAYS = 400
export const BACKUP_RULE_ID = 'account-backups-expiry'

/** Cloud Sync slots: deleted 400 days after their last put. */
export const SYNC_EXPIRY_DAYS = 400
export const SYNC_RULE_ID = 'account-sync-expiry'

export const MULTIPART_RULE_ID = 'Default Multipart Abort Rule'

/**
 * Each bucket family's expiry rule, by bucket name prefix; `days: null` for a
 * family with no age rule (photos are written once).
 */
export const BUCKET_RULES = [
  { bucketPrefix: 'ww-buddy-blobs', id: BACKSTOP_RULE_ID, days: BACKSTOP_DAYS },
  { bucketPrefix: 'ww-account-backups', id: BACKUP_RULE_ID, days: BACKUP_EXPIRY_DAYS },
  { bucketPrefix: 'ww-account-sync', id: SYNC_RULE_ID, days: SYNC_EXPIRY_DAYS },
  { bucketPrefix: 'ww-account-photos', id: null, days: null },
]

/** The expiry rule for `bucket`, or null for a bucket this script doesn't know. */
export const ruleFor = (bucket = 'ww-buddy-blobs') =>
  BUCKET_RULES.find((rule) => bucket.startsWith(rule.bucketPrefix)) ?? null

export const lifecycleRules = (bucket = 'ww-buddy-blobs') => {
  const rule = ruleFor(bucket)
  if (!rule) throw new Error(`no lifecycle rule for bucket ${bucket}`)
  return {
    rules: [
      ...(rule.days == null
        ? []
        : [
            {
              id: rule.id,
              enabled: true,
              conditions: { prefix: BLOB_PREFIX },
              deleteObjectsTransition: {
                condition: { type: 'Age', maxAge: rule.days * DAY_SECONDS },
              },
            },
          ]),
      {
        id: MULTIPART_RULE_ID,
        enabled: true,
        conditions: { prefix: '' },
        abortMultipartUploadsTransition: {
          condition: { type: 'Age', maxAge: 7 * DAY_SECONDS },
        },
      },
    ],
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const wrangler = (args) => {
  const result = spawnSync(
    join(root, 'node_modules', '.bin', 'wrangler'),
    args,
    { cwd: root, encoding: 'utf8' }
  )
  return {
    ok: result.status === 0,
    output: stripVTControlCharacters(`${result.stdout ?? ''}${result.stderr ?? ''}`),
  }
}

/** wrangler's labelled blocks (`name: …` lines, blank lines between) as objects. */
export const parseBlocks = (output) =>
  output
    .split(/\n\s*\n/)
    .map((block) =>
      Object.fromEntries(
        block
          .split('\n')
          .map((line) => /^(\w+):\s+(.*)$/.exec(line.trim()))
          .filter(Boolean)
          .map(([, label, value]) => [label, value.trim()])
      )
    )
    .filter((fields) => Object.keys(fields).length)

const bucketExists = (bucket) => {
  const listed = wrangler(['r2', 'bucket', 'list'])
  if (!listed.ok) throw new Error(`wrangler r2 bucket list failed:\n${listed.output}`)
  return parseBlocks(listed.output).some((fields) => fields.name === bucket)
}

/**
 * Whether the bucket's rules (wrangler's listing, parsed) are what its
 * family needs: its expiry rule at the right age, or, for a family with no
 * age rule, the multipart-abort rule and no expiry at all.
 */
export const rulesMatch = (rules, expected) =>
  expected.days == null
    ? rules.some((rule) => rule.name === MULTIPART_RULE_ID) &&
      !rules.some((rule) => /expire/i.test(rule.action ?? ''))
    : rules.some(
        (rule) =>
          rule.name === expected.id &&
          rule.enabled === 'Yes' &&
          rule.prefix === BLOB_PREFIX &&
          rule.action?.includes(`Expire objects after ${expected.days} days`)
      )

const backstopSet = (bucket, expected) => {
  const listed = wrangler(['r2', 'bucket', 'lifecycle', 'list', bucket])
  if (!listed.ok) throw new Error(`wrangler r2 bucket lifecycle list failed:\n${listed.output}`)
  return rulesMatch(parseBlocks(listed.output), expected)
}

const describeRule = (expected) =>
  expected.days == null ? 'no expiry, multipart abort only' : `${expected.id}, ${expected.days} days`

const main = () => {
  const [bucket, ...flags] = process.argv.slice(2)
  const check = flags.includes('--check')
  if (!bucket || bucket.startsWith('-')) {
    console.error('usage: node scripts/r2-lifecycle.mjs <bucket> [--check]')
    process.exit(2)
  }
  const expected = ruleFor(bucket)
  if (!expected) {
    console.error(`r2-lifecycle: no rule for ${bucket} (known: ${BUCKET_RULES.map((rule) => `${rule.bucketPrefix}*`).join(', ')})`)
    process.exit(2)
  }

  if (!bucketExists(bucket)) {
    if (check) {
      console.error(`r2-lifecycle: bucket ${bucket} does not exist`)
      process.exit(1)
    }
    const created = wrangler(['r2', 'bucket', 'create', bucket])
    if (!created.ok) throw new Error(`creating ${bucket} failed:\n${created.output}`)
    console.log(`r2-lifecycle: created ${bucket}`)
  }

  if (check) {
    if (!backstopSet(bucket, expected)) {
      console.error(`r2-lifecycle: ${bucket}'s rules aren't ${describeRule(expected)}`)
      process.exit(1)
    }
    console.log(`r2-lifecycle: ${bucket} ok (${describeRule(expected)})`)
    return
  }

  const dir = mkdtempSync(join(tmpdir(), 'r2-lifecycle-'))
  try {
    const file = join(dir, 'lifecycle.json')
    writeFileSync(file, JSON.stringify(lifecycleRules(bucket), null, 2))
    const set = wrangler(['r2', 'bucket', 'lifecycle', 'set', bucket, '--file', file, '--force'])
    if (!set.ok) throw new Error(`setting ${bucket}'s lifecycle failed:\n${set.output}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  if (!backstopSet(bucket, expected)) throw new Error(`${bucket}'s lifecycle rules did not take`)
  console.log(`r2-lifecycle: ${bucket} ok (${describeRule(expected)})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(`r2-lifecycle: ${error.message}`)
    process.exit(1)
  }
}
