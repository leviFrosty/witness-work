import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSessionError } from '@/lib/serverAccount/session'

// The new phone once the key arrived: a connection that drops while it signs in
// with the key leaves the handoff where it was, so it can run again.

const fake = vi.hoisted(() => ({
  openDetached: vi.fn(),
  replaceAccountKey: vi.fn(),
  connect: vi.fn(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }))
vi.mock('expo-application', () => ({ nativeApplicationVersion: '3.0.0' }))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('expo-device', () => ({ modelName: 'Pixel 9' }))
vi.mock('@/constants/apis', () => ({
  default: {
    accounts: 'https://t',
    attestationStatus: 'https://t/attestation/v1/status',
  },
}))
vi.mock('@/app/account/accountKey', () => ({
  accountKey: {
    peek: async () => null,
    getOrCreate: async () => new Uint8Array(32).fill(5),
    lossIfReplaced: async () => ({ buddies: 0, buddyNames: [] }),
  },
  accountKeyAvailable: () => true,
  replaceAccountKey: fake.replaceAccountKey,
}))
vi.mock('@/app/account/passkeyPrompt', () => ({ earnPasskeyPrompt: vi.fn() }))
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
  serverAccount: { connect: fake.connect },
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

import {
  approveHandoff,
  completeClaimHandoff,
  startClaimHandoff,
  startOfferHandoff,
} from './handoff'
import { earnPasskeyPrompt } from '@/app/account/passkeyPrompt'
import { analytics } from '@/lib/analytics'
import {
  createClaimSession,
  createOfferSession,
} from '@/lib/serverAccount/handoffSession'
import type {
  ClaimSession,
  OfferSession,
} from '@/lib/serverAccount/handoffSession'

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

// The old phone: Allow sends the account key only once the device's owner
// confirms it, so someone holding the unlocked phone can't sign theirs in.
describe('approveHandoff', () => {
  const offer = () => {
    const session = { approve: vi.fn(async () => undefined) }
    return {
      session,
      approve: (confirmOwner: () => Promise<string>) =>
        approveHandoff(session as unknown as OfferSession, {
          confirmOwner: confirmOwner as never,
        }),
    }
  }

  it.each([
    ['confirmed', 'device'],
    ['noLock', 'none'],
  ] as const)(
    'sends the key once the owner check is %s',
    async (check, auth) => {
      const { session, approve } = offer()
      const confirmOwner = vi.fn(async () => check)
      expect(await approve(confirmOwner)).toBe('sent')
      expect(confirmOwner).toHaveBeenCalledOnce()
      expect(session.approve).toHaveBeenCalledOnce()
      expect(analytics.capture).toHaveBeenCalledWith('handoff_answered', {
        answer: 'allow',
        auth,
      })
    }
  )

  it.each(['cancelled', 'failed'] as const)(
    'keeps the key when the owner check is %s',
    async (check) => {
      const { session, approve } = offer()
      expect(await approve(async () => check)).toBe(check)
      expect(session.approve).not.toHaveBeenCalled()
      expect(analytics.capture).toHaveBeenCalledWith('handoff_answered', {
        answer: 'allow',
        auth: check,
      })
    }
  )

  it('keeps the key when asking the owner throws', async () => {
    const { session, approve } = offer()
    const outcome = await approve(async () => {
      throw new Error('LocalAuthentication unavailable')
    })
    expect(outcome).toBe('failed')
    expect(session.approve).not.toHaveBeenCalled()
  })

  it('asks again after a cancel, and not again after a confirmed Allow', async () => {
    const { session, approve } = offer()
    const confirmOwner = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('cancelled')
      .mockResolvedValueOnce('confirmed')
    expect(await approve(confirmOwner)).toBe('cancelled')
    expect(await approve(confirmOwner)).toBe('sent')
    // A send that didn't get through: tapping Allow again doesn't ask again.
    expect(await approve(confirmOwner)).toBe('sent')
    expect(confirmOwner).toHaveBeenCalledTimes(2)
    expect(session.approve).toHaveBeenCalledTimes(2)
  })
})

describe('the gentle passkey prompt after a handoff', () => {
  /** A session that reports each step it reaches, as the real ones do. */
  function stepping(role: 'offer' | 'claim') {
    const listeners = new Set<() => void>()
    const session = {
      role,
      state: { step: 'waiting' as string },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      open: vi.fn(async () => undefined),
      claim: vi.fn(async () => undefined),
      reach: (step: string) => {
        session.state = { step }
        listeners.forEach((listener) => listener())
      },
    }
    return session
  }

  it('is earned by the phone that set up another device', async () => {
    const session = stepping('offer')
    vi.mocked(createOfferSession).mockReturnValueOnce(session as never)
    fake.connect.mockResolvedValueOnce({ accountId: ACCOUNT_ID })
    await startOfferHandoff('settings')
    session.reach('done')
    expect(earnPasskeyPrompt).toHaveBeenCalledWith('device')
  })

  it('is not earned by the new phone, which is the one being set up', () => {
    const session = stepping('claim')
    vi.mocked(createClaimSession).mockReturnValueOnce(session as never)
    startClaimHandoff({} as never, 'link')
    session.reach('done')
    expect(earnPasskeyPrompt).not.toHaveBeenCalled()
  })

  it('is not earned by a handoff that failed or was declined', async () => {
    const session = stepping('offer')
    vi.mocked(createOfferSession).mockReturnValueOnce(session as never)
    fake.connect.mockResolvedValueOnce({ accountId: ACCOUNT_ID })
    await startOfferHandoff('settings')
    session.reach('failed')
    session.reach('declined')
    expect(earnPasskeyPrompt).not.toHaveBeenCalled()
  })

  it('is not earned by a handoff the app started quietly', async () => {
    const session = stepping('offer')
    vi.mocked(createOfferSession).mockReturnValueOnce(session as never)
    fake.connect.mockResolvedValueOnce({ accountId: ACCOUNT_ID })
    await startOfferHandoff('onboarding', { quiet: true })
    session.reach('done')
    expect(earnPasskeyPrompt).not.toHaveBeenCalled()
  })
})
