import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

import { createSqliteState, type SqliteState } from '../test/durableObjects'
import type { Environment } from '../types'
import { PlayIntegrityChallenges } from './challengeDO'
import type { PlayIntegrityChallengeRequest } from './protocol'

const T0 = 1_800_000_000_000
const TTL_MS = 300_000

const request = (
  override: Partial<PlayIntegrityChallengeRequest> = {}
): PlayIntegrityChallengeRequest => ({
  attestationProvider: 'play-integrity',
  protocolVersion: 1,
  operation: 'assert',
  operationId: 'play-operation-1',
  uuid: 'install-uuid-1',
  accountId: 'account-id-1',
  purpose: 'notes-import-kickoff',
  contentHash: 'a'.repeat(64),
  requestHash: 'b'.repeat(64),
  ...override,
})

describe('PlayIntegrityChallenges', () => {
  let now: number
  let counter: number
  let sqlite: SqliteState
  let challenges: PlayIntegrityChallenges

  const create = () =>
    new PlayIntegrityChallenges(sqlite.state, {} as Environment, {
      now: () => now,
      randomChallenge: () => `${String(++counter).padStart(2, '0')}${'X'.repeat(41)}`,
    })

  beforeEach(() => {
    now = T0
    counter = 0
    sqlite = createSqliteState('install-uuid-1')
    challenges = create()
  })

  const issue = async (override?: Partial<PlayIntegrityChallengeRequest>) => {
    const result = await challenges.issueChallenge(request(override))
    if (!result.ok) throw new Error(result.error.reason)
    return result.value
  }

  it('issues a short-lived challenge echoing the protocol fields', async () => {
    await expect(challenges.issueChallenge(request())).resolves.toEqual({
      ok: true,
      value: {
        attestationProvider: 'play-integrity',
        protocolVersion: 1,
        operation: 'assert',
        operationId: 'play-operation-1',
        challenge: `01${'X'.repeat(41)}`,
        expiresAt: T0 + TTL_MS,
      },
    })
  })

  it('returns the same challenge when a lost response is retried', async () => {
    const first = await issue()
    now += 1_000
    await expect(issue()).resolves.toEqual(first)
  })

  it('rejects reusing an operation id for a different request', async () => {
    await issue()
    await expect(
      challenges.issueChallenge(request({ contentHash: 'c'.repeat(64) }))
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'operation_conflict', action: 'start_new_operation' },
    })
  })

  it('consumes a challenge exactly once and reports when it was issued', async () => {
    const { challenge } = await issue()
    now += 5_000
    await expect(
      challenges.consumeChallenge({ ...request(), challenge })
    ).resolves.toEqual({ ok: true, value: { issuedAt: T0 } })
    await expect(
      challenges.consumeChallenge({ ...request(), challenge })
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'challenge_not_found' },
    })
    // A consumed operation can't be reissued either.
    await expect(challenges.issueChallenge(request())).resolves.toMatchObject({
      ok: false,
      error: { reason: 'operation_conflict' },
    })
  })

  it('rejects a challenge presented with a different descriptor', async () => {
    const { challenge } = await issue()
    await expect(
      challenges.consumeChallenge({
        ...request({ accountId: 'someone-else' }),
        challenge,
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'operation_conflict' },
    })
  })

  it('rejects an unknown or mismatched challenge', async () => {
    await issue()
    await expect(
      challenges.consumeChallenge({ ...request(), challenge: 'Y'.repeat(43) })
    ).resolves.toMatchObject({ ok: false, error: { reason: 'challenge_not_found' } })
    await expect(
      challenges.consumeChallenge({
        ...request({ operationId: 'never-issued-op' }),
        challenge: 'Y'.repeat(43),
      })
    ).resolves.toMatchObject({ ok: false, error: { reason: 'challenge_not_found' } })
  })

  it('expires challenges after the TTL', async () => {
    const { challenge } = await issue()
    now += TTL_MS
    await expect(
      challenges.consumeChallenge({ ...request(), challenge })
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'challenge_expired', action: 'start_new_operation' },
    })
  })

  it('caps outstanding challenges per install', async () => {
    for (let index = 0; index < 32; index += 1) {
      await issue({ operationId: `play-operation-${index + 10}` })
    }
    await expect(
      challenges.issueChallenge(request({ operationId: 'one-too-many' }))
    ).resolves.toMatchObject({
      ok: false,
      error: { reason: 'too_many_challenges', status: 429 },
    })
    now += TTL_MS
    await expect(issue({ operationId: 'after-expiry' })).resolves.toMatchObject({
      operationId: 'after-expiry',
    })
  })

  it('schedules cleanup and deletes all state once everything expired', async () => {
    await issue()
    expect(sqlite.alarm()).toBe(T0 + TTL_MS + 1_000)

    now = T0 + TTL_MS + 1_000
    sqlite.clearAlarm()
    await challenges.alarm()
    expect(sqlite.tables()).toEqual([])
    expect(sqlite.alarm()).toBeNull()

    // The live instance recreates its schema after deleteAll().
    await expect(issue({ operationId: 'after-cleanup' })).resolves.toMatchObject({
      operationId: 'after-cleanup',
    })
  })

  it('reschedules cleanup while unexpired challenges remain', async () => {
    await issue()
    now += 100_000
    await issue({ operationId: 'later-operation' })
    now = T0 + TTL_MS + 1_000
    sqlite.clearAlarm()
    await challenges.alarm()
    expect(sqlite.query('SELECT operation_id FROM challenge')).toEqual([
      { operation_id: 'later-operation' },
    ])
    expect(sqlite.alarm()).toBe(T0 + 100_000 + TTL_MS + 1_000)
  })
})
