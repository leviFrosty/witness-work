import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSessionError } from '@/lib/serverAccount/session'

// The new phone once the key arrived: a connection that drops while it signs in
// with the key leaves the handoff where it was, so it can run again.

const fake = vi.hoisted(() => ({
  openDetached: vi.fn(),
  replaceAccountKey: vi.fn(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }))
vi.mock('expo-application', () => ({ nativeApplicationVersion: '3.0.0' }))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('expo-device', () => ({ modelName: 'Pixel 9' }))
vi.mock('@/constants/apis', () => ({
  default: { accounts: 'https://t', notesImport: 'https://t/notes-import' },
}))
vi.mock('@/app/account/accountKey', () => ({
  accountKey: {
    peek: async () => null,
    lossIfReplaced: async () => ({ buddies: 0, buddyNames: [] }),
  },
  accountKeyAvailable: () => true,
  replaceAccountKey: fake.replaceAccountKey,
}))
vi.mock('@/app/account/backup', () => ({ backUpNow: vi.fn() }))
vi.mock('@/app/account/backupRestore', () => ({
  offerRestore: async () => ({ outcome: 'none' }),
}))
vi.mock('@/app/buddies/joinBuddiesHere', () => ({ joinBuddiesHere: vi.fn() }))
vi.mock('@/lib/accountKey/accountKey', () => ({ losesSomething: () => false }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: { openDetached: fake.openDetached },
  serverAccount: {},
}))
vi.mock('@/lib/serverAccount/backupStore', () => ({
  useBackupState: { getState: () => ({ enabled: false }) },
}))
vi.mock('@/lib/serverAccount/handoffSession', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createClaimSession: vi.fn(),
  createOfferSession: vi.fn(),
}))
vi.mock('@/lib/syncClock', () => ({ syncNow: () => Date.now() }))
vi.mock('@/features/buddies/lib/engine', () => ({
  BuddyRemovalPendingError: class extends Error {},
}))

import { completeClaimHandoff } from './handoff'
import type { ClaimSession } from '@/lib/serverAccount/handoffSession'

const ACCOUNT_ID = 'account-1'

/** A claim session that has the key. */
function received() {
  return {
    role: 'claim' as const,
    state: {
      step: 'received' as const,
      code: '123456',
      received: {
        accountKey: new Uint8Array(32).fill(3),
        accountId: ACCOUNT_ID,
      },
    },
    fail: vi.fn(),
    finish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  }
}

const complete = (session: ReturnType<typeof received>) =>
  completeClaimHandoff(session as unknown as ClaimSession, {
    confirmReplace: async () => true,
    buddiesEnabled: false,
  })

const opened = () => ({
  accountId: ACCOUNT_ID,
  close: vi.fn(async () => undefined),
})

beforeEach(() => {
  vi.clearAllMocks()
  fake.replaceAccountKey.mockResolvedValue({
    outcome: 'replaced',
    accountId: ACCOUNT_ID,
  })
})

describe('completeClaimHandoff', () => {
  it.each(['offline', 'server', 'rateLimited'] as const)(
    'keeps the key and the channel when opening the session fails as %s, then signs in on the next try',
    async (failure) => {
      const session = received()
      fake.openDetached.mockRejectedValueOnce(new AccountSessionError(failure))

      const first = await complete(session)
      expect(first).toEqual({
        outcome: 'failed',
        reason: failure,
        retryable: true,
      })
      expect(session.fail).not.toHaveBeenCalled()
      expect(session.cancel).not.toHaveBeenCalled()

      fake.openDetached.mockResolvedValueOnce(opened())
      const second = await complete(session)
      expect(second).toMatchObject({ outcome: 'done' })
      expect(session.finish).toHaveBeenCalledTimes(1)
    }
  )

  it('keeps the key when verifying this phone fails for now', async () => {
    const session = received()
    fake.openDetached.mockRejectedValueOnce(
      new AccountSessionError('attestation', { attestation: 'temporary' })
    )
    expect(await complete(session)).toEqual({
      outcome: 'failed',
      reason: 'verifyLater',
      retryable: true,
    })
    expect(session.fail).not.toHaveBeenCalled()
  })

  it.each([
    [
      new AccountSessionError('attestation', { attestation: 'device' }),
      'unverified',
    ],
    [new AccountSessionError('upgrade', { status: 426 }), 'updateRequired'],
  ] as const)(
    'ends the handoff when the session can never open (%s)',
    async (error, reason) => {
      const session = received()
      fake.openDetached.mockRejectedValueOnce(error)
      expect(await complete(session)).toEqual({ outcome: 'failed', reason })
      expect(session.fail).toHaveBeenCalledWith(reason)
    }
  )
})
