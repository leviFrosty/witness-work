import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { fetchAccountInfo } from '@/lib/serverAccount/client'
import {
  fetchKeyHistory,
  rekeyAccount,
} from '@/lib/serverAccount/keyChangeClient'
import {
  appendKeyHistory,
  keyHistoryEntry,
  openKeyHistory,
  sealKeyHistory,
} from '@/lib/serverAccount/keyHistory'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
  interopSessions,
} from '@/lib/serverAccount/testing/interopSessions'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

/**
 * Opt-in contract check of changing the account key against a real worker (see
 * `interopSessions`; docs/account-key-change.md). Skipped by default.
 */
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const pub = (key: Uint8Array) => deriveAccountSigningKey(key).publicKey

async function changed() {
  const account = await interopAccount(random)
  const K1 = account.accountKey
  const K2 = random(32)
  // A token from before the change, for the checks below.
  const staleToken = await account.sessions.withSession(async (auth) => auth, {
    accountKey: K1,
  })
  const history = appendKeyHistory(null, keyHistoryEntry(K1, 0, Date.now()))
  const result = await rekeyAccount(
    {
      oldKey: K1,
      newKey: K2,
      keyEpoch: 0,
      history: sealKeyHistory(K2, account.accountId, 1, history, random(24)),
    },
    { ...account.bearer, now: Date.now, randomBytes: random }
  )
  return { ...account, K1, K2, history, result, staleToken }
}

describe.skipIf(!interopEnabled)(
  'account key change against a real worker',
  () => {
    it('moves the account to the new key, keeping the caller’s session', async () => {
      const { K1, K2, accountId, sessions, result } = await changed()
      expect(result).toMatchObject({ outcome: 'committed', keyEpoch: 1 })
      if (result.outcome !== 'committed') return
      const sessionId = sessions.snapshot()!.sessionId
      expect(
        await sessions.repoint(pub(K1), pub(K2), {
          accessToken: result.accessToken,
          accessExpiresAt: result.accessExpiresAt,
        })
      ).toBe(true)
      const info = await fetchAccountInfo({
        baseUrl: interopRelayUrl!,
        authorize: (run) => sessions.withSession(run, { accountKey: K2 }),
      })
      expect(info).toMatchObject({
        accountId,
        accountPub: pub(K2),
        keyEpoch: 1,
      })
      // The same session, refreshed with the new epoch.
      await sessions.withSession(async () => undefined, {
        accountKey: K2,
        renew: true,
      })
      expect(sessions.snapshot()).toMatchObject({
        sessionId,
        accountPub: pub(K2),
      })
    })

    it('stores the history for the new key to open', async () => {
      const { K2, accountId, history, result } = await changed()
      if (result.outcome !== 'committed') throw new Error('not committed')
      const stored = await fetchKeyHistory({
        baseUrl: interopRelayUrl!,
        authorize: (run) => run(`Bearer ${result.accessToken}`),
      })
      expect(stored.keyEpoch).toBe(1)
      expect(openKeyHistory(K2, accountId, 1, stored.history!)).toEqual(history)
    })

    it('refuses a change from an epoch that’s gone', async () => {
      const { K2, result } = await changed()
      if (result.outcome !== 'committed') throw new Error('not committed')
      const again = await rekeyAccount(
        {
          oldKey: K2,
          newKey: random(32),
          keyEpoch: 0,
          history: 'AQ',
        },
        {
          baseUrl: interopRelayUrl!,
          authorize: (run) => run(`Bearer ${result.accessToken}`),
          now: Date.now,
          randomBytes: random,
        }
      )
      expect(again).toMatchObject({ outcome: 'conflict', keyEpoch: 1 })
    })

    it('refuses the retired key, and opens the new one only into its account', async () => {
      const { K1, K2, accountId } = await changed()
      const retired = interopSessions(random, K1)
      await expect(retired.ensure(K1)).rejects.toMatchObject({
        failure: 'keyRetired',
        changedAt: expect.any(Number),
      })
      const rejoin = interopSessions(random, K2)
      await expect(rejoin.ensure(K2, { accountId })).resolves.toMatchObject({
        accountId,
      })
      const stranger = interopSessions(random)
      await expect(
        stranger.ensure(random(32), { accountId })
      ).rejects.toMatchObject({ serverCode: 'unknown_account' })
    })

    it('answers 401 key_changed to a token from before the change', async () => {
      const { K2, staleToken, result } = await changed()
      if (result.outcome !== 'committed') throw new Error('not committed')
      const again = await rekeyAccount(
        { oldKey: K2, newKey: random(32), keyEpoch: 1, history: 'AQ' },
        {
          baseUrl: interopRelayUrl!,
          authorize: (run) => run(staleToken),
          now: Date.now,
          randomBytes: random,
        }
      )
      expect(again).toEqual({ outcome: 'keyChanged' })
    })

    it('answers conflict to the key the account just retired', async () => {
      const { K1, result } = await changed()
      if (result.outcome !== 'committed') throw new Error('not committed')
      const again = await rekeyAccount(
        { oldKey: K1, newKey: random(32), keyEpoch: 0, history: 'AQ' },
        {
          baseUrl: interopRelayUrl!,
          authorize: (run) => run(`Bearer ${result.accessToken}`),
          now: Date.now,
          randomBytes: random,
        }
      )
      expect(again).toMatchObject({ outcome: 'conflict', keyEpoch: 1 })
    })
  }
)
