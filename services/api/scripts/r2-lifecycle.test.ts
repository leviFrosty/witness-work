import { expect, it } from 'vitest'
import { BUDDIES_LIMITS, buddyBlobKey } from '../src/buddies/contracts'
import { backupObjectKey } from '../src/accounts/contracts'
import { SYNC_LIMITS, syncObjectKey, syncPhotoObjectKey } from '../src/accounts/syncContracts'
import {
  BACKSTOP_DAYS,
  BACKSTOP_RULE_ID,
  BACKUP_EXPIRY_DAYS,
  BACKUP_RULE_ID,
  BLOB_PREFIX,
  SYNC_EXPIRY_DAYS,
  SYNC_RULE_ID,
  MULTIPART_RULE_ID,
  lifecycleRules,
  parseBlocks,
  ruleFor,
  rulesMatch,
} from './r2-lifecycle.mjs'

const DAY_MS = 24 * 60 * 60 * 1000

/** Keeps the deploy's R2 lifecycle rule in step with the relay. */

it('deletes objects a day past the longest a blob can live', () => {
  expect(BACKSTOP_DAYS).toBe(BUDDIES_LIMITS.maxBlobLifetimeMs / DAY_MS + 1)
  const [backstop] = lifecycleRules().rules
  expect(backstop).toEqual({
    id: BACKSTOP_RULE_ID,
    enabled: true,
    conditions: { prefix: BLOB_PREFIX },
    deleteObjectsTransition: {
      condition: { type: 'Age', maxAge: BACKSTOP_DAYS * 24 * 60 * 60 },
    },
  })
  expect(buddyBlobKey('inbox', 'blob').startsWith(BLOB_PREFIX)).toBe(true)
})

it('deletes account backup slots 400 days after their last upload', () => {
  expect(BACKUP_EXPIRY_DAYS).toBe(400)
  for (const bucket of ['ww-account-backups', 'ww-account-backups-beta']) {
    const [expiry, multipart] = lifecycleRules(bucket).rules
    expect(expiry).toEqual({
      id: BACKUP_RULE_ID,
      enabled: true,
      conditions: { prefix: BLOB_PREFIX },
      deleteObjectsTransition: {
        condition: { type: 'Age', maxAge: 400 * 24 * 60 * 60 },
      },
    })
    expect(multipart.id).toBe('Default Multipart Abort Rule')
  }
  expect(lifecycleRules('ww-buddy-blobs-beta').rules[0].id).toBe(BACKSTOP_RULE_ID)
  expect(ruleFor('some-other-bucket')).toBeNull()
  expect(backupObjectKey('account', 'slot').startsWith(BLOB_PREFIX)).toBe(true)
})

it('deletes Cloud Sync slots 400 days after their last put', () => {
  expect(SYNC_EXPIRY_DAYS).toBe(SYNC_LIMITS.maxRetentionMs / DAY_MS)
  for (const bucket of ['ww-account-sync', 'ww-account-sync-beta']) {
    const [expiry] = lifecycleRules(bucket).rules
    expect(expiry).toEqual({
      id: SYNC_RULE_ID,
      enabled: true,
      conditions: { prefix: BLOB_PREFIX },
      deleteObjectsTransition: {
        condition: { type: 'Age', maxAge: 400 * 24 * 60 * 60 },
      },
    })
  }
  expect(syncObjectKey('account', 'slot').startsWith(BLOB_PREFIX)).toBe(true)
})

it('reads wrangler’s labelled blocks', () => {
  const output = [
    "Listing lifecycle rules for bucket 'ww-buddy-blobs'...",
    'name:     buddy-blobs-backstop',
    'enabled:  Yes',
    'prefix:   v1/',
    'action:   Expire objects after 91 days',
    '',
    'name:     Default Multipart Abort Rule',
    'enabled:  Yes',
    'prefix:   (all prefixes)',
    'action:   Abort incomplete multipart uploads after 7 days',
  ].join('\n')
  expect(parseBlocks(output)).toEqual([
    {
      name: 'buddy-blobs-backstop',
      enabled: 'Yes',
      prefix: 'v1/',
      action: 'Expire objects after 91 days',
    },
    {
      name: 'Default Multipart Abort Rule',
      enabled: 'Yes',
      prefix: '(all prefixes)',
      action: 'Abort incomplete multipart uploads after 7 days',
    },
  ])
})

it('gives Cloud Sync photo buckets no age rule, only the multipart abort', () => {
  for (const bucket of ['ww-account-photos', 'ww-account-photos-beta']) {
    // Not the snapshots' 400-day family.
    expect(ruleFor(bucket)).toMatchObject({ bucketPrefix: 'ww-account-photos', days: null })
    expect(bucket.startsWith('ww-account-sync')).toBe(false)
    const { rules } = lifecycleRules(bucket)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ id: MULTIPART_RULE_ID, abortMultipartUploadsTransition: expect.anything() })
    expect(JSON.stringify(rules)).not.toContain('deleteObjectsTransition')
  }
  const expected = ruleFor('ww-account-photos')!
  const multipart = { name: MULTIPART_RULE_ID, enabled: 'Yes', prefix: '(all prefixes)', action: 'Abort incomplete multipart uploads after 7 days' }
  expect(rulesMatch([multipart], expected)).toBe(true)
  expect(rulesMatch([multipart, { name: 'x', enabled: 'Yes', prefix: 'v1/', action: 'Expire objects after 400 days' }], expected)).toBe(false)
  expect(rulesMatch([], expected)).toBe(false)
  expect(syncPhotoObjectKey('account', 'name', 'put').startsWith(BLOB_PREFIX)).toBe(true)
})
