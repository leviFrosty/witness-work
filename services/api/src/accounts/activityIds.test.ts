import { describe, expect, it } from 'vitest'
import { ACTIVITY_ID_CHARS, openActivityId, sealActivityId } from './activityIds'
import { accessTokenKeys, activityIdKeys } from './tokens'

/**
 * Activity ids and cursors: the row id sealed for its account, so they're
 * opaque, unlinkable across accounts, stable, and refused when forged.
 */

const SECRET = 'activity-id-test-secret-0123456789abcdef'
const OTHER_SECRET = 'activity-id-other-secret-0123456789abcdef'
const ALICE = 'aaaaaaaaaaaaaaaaaaaaaa'
const BOB = 'bbbbbbbbbbbbbbbbbbbbbb'

const keysFor = async (current: string, previous?: string) =>
  (await accessTokenKeys({
    ACCOUNT_TOKEN_SECRET: current,
    ACCOUNT_TOKEN_SECRET_PREVIOUS: previous,
    APP_ATTEST_ENVIRONMENT: 'development',
  }))!

describe('activity ids', () => {
  it('round-trips a row id for its own account', async () => {
    const keys = await keysFor(SECRET)
    for (const rowId of [1, 2, 41, 2 ** 40, Number.MAX_SAFE_INTEGER]) {
      const id = await sealActivityId(keys.current.activityIds, ALICE, rowId)
      expect(id).toHaveLength(ACTIVITY_ID_CHARS)
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(await openActivityId(activityIdKeys(keys), ALICE, id)).toBe(rowId)
    }
  })

  it('is the same id every time, and says nothing about the row id', async () => {
    const keys = (await keysFor(SECRET)).current.activityIds
    const seal = (accountId: string, rowId: number) =>
      sealActivityId(keys, accountId, rowId)
    expect(await seal(ALICE, 7)).toBe(await seal(ALICE, 7))
    // Neighbouring rows, and one row under two accounts, share nothing visible.
    const ids = [await seal(ALICE, 7), await seal(ALICE, 8), await seal(BOB, 7)]
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(id).not.toMatch(/^[0-9]+$/)
    const [seven, eight] = ids
    expect(seven.slice(0, 16)).not.toBe(eight.slice(0, 16))
  })

  it('refuses another account’s id, a forged one, and a bare row id', async () => {
    const keys = await keysFor(SECRET)
    const open = (accountId: string, value: string) =>
      openActivityId(activityIdKeys(keys), accountId, value)
    const id = await sealActivityId(keys.current.activityIds, ALICE, 7)
    expect(await open(BOB, id)).toBeNull()
    const flipped = id.slice(0, 20) + (id[20] === 'A' ? 'B' : 'A') + id.slice(21)
    expect(await open(ALICE, flipped)).toBeNull()
    for (const value of ['7', '', 'x'.repeat(ACTIVITY_ID_CHARS), `${id}A`, id.slice(1)])
      expect(await open(ALICE, value), value).toBeNull()
  })

  it('opens a cursor sealed under the previous secret, and not once it’s gone', async () => {
    const before = await keysFor(SECRET)
    const id = await sealActivityId(before.current.activityIds, ALICE, 7)
    const rotated = await keysFor(OTHER_SECRET, SECRET)
    expect(await openActivityId(activityIdKeys(rotated), ALICE, id)).toBe(7)
    // New ids are sealed under the new secret.
    expect(await sealActivityId(rotated.current.activityIds, ALICE, 7)).not.toBe(id)
    const after = await keysFor(OTHER_SECRET)
    expect(await openActivityId(activityIdKeys(after), ALICE, id)).toBeNull()
  })
})
