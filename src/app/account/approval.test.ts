import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhoneApprovalState } from '@/lib/serverAccount/approvalSession'
import { AccountSessionError } from '@/lib/serverAccount/session'

// Approving a browser from this phone: the account it approves with, the
// owner check before YES, and what analytics hears (codes only, no PII).

const fake = vi.hoisted(() => ({
  connect: vi.fn(),
  getOrCreate: vi.fn(),
  available: vi.fn(() => true),
  createPhoneApproval: vi.fn(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-application', () => ({ nativeApplicationVersion: '3.0.0' }))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('expo-device', () => ({ modelName: 'iPhone 17' }))
vi.mock('@/constants/apis', () => ({
  default: {
    accounts: 'https://t',
    attestationStatus: 'https://t/attestation/v1/status',
  },
}))
vi.mock('@/app/account/accountKey', () => ({
  accountKey: { getOrCreate: fake.getOrCreate },
  accountKeyAvailable: fake.available,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: { withSession: vi.fn() },
  serverAccount: { connect: fake.connect },
}))
vi.mock('@/lib/serverAccount/approvalRuntime', () => ({
  appApprovalOrigins: () => ['https://app.witnesswork.app'],
}))
vi.mock('@/lib/serverAccount/approvalSession', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createPhoneApproval: fake.createPhoneApproval,
}))
vi.mock('@/lib/syncClock', () => ({ syncNow: () => Date.now() }))
// `handoff.ts` comes along for its shared helpers.
vi.mock('@/app/account/backup', () => ({ backUpNow: vi.fn() }))
vi.mock('@/app/account/backupRestore', () => ({ offerRestore: vi.fn() }))
vi.mock('@/app/buddies/joinBuddiesHere', () => ({ joinBuddiesHere: vi.fn() }))
vi.mock('@/lib/serverAccount/backupStore', () => ({
  useBackupState: { getState: () => ({ enabled: false }) },
}))
vi.mock('@/features/buddies/lib/engine', () => ({
  BuddyRemovalPendingError: class extends Error {},
}))

import {
  approveBrowser,
  endApproval,
  startPhoneApproval,
  useApprovalDebug,
} from './approval'
import { analytics } from '@/lib/analytics'

const LINK = 'https://app.witnesswork.app/approve#1abc'
const HELLO = { browser: 'Chrome', system: 'macOS', appVersion: '3.0.0' }
const CONFIRM: PhoneApprovalState = {
  step: 'confirm',
  hello: HELLO,
  far: true,
  code: '123456',
  expiresAt: Date.now() + 60_000,
}

/** A phone approval whose state the test moves along. */
function fakeSession(initial: PhoneApprovalState = { step: 'idle' }) {
  let state = initial
  const listeners = new Set<() => void>()
  const session = {
    get state() {
      return state
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    claim: vi.fn(async () => undefined),
    approve: vi.fn(async () => {
      session.set({ step: 'done', hello: HELLO })
    }),
    cancel: vi.fn(async () => {
      session.set({ step: 'cancelled' })
    }),
    decline: vi.fn(async () => undefined),
    poll: vi.fn(async () => undefined),
    debug: vi.fn(),
    set(next: PhoneApprovalState) {
      state = next
      for (const listener of listeners) listener()
    },
  }
  return session
}

const captured = () => vi.mocked(analytics.capture).mock.calls

beforeEach(() => {
  vi.clearAllMocks()
  fake.available.mockReturnValue(true)
  fake.getOrCreate.mockResolvedValue(new Uint8Array(32).fill(7))
  fake.connect.mockResolvedValue({ accountId: 'account-1' })
})

describe('startPhoneApproval', () => {
  it('claims the scanned code with the account and this phone’s name', async () => {
    const session = fakeSession()
    fake.createPhoneApproval.mockReturnValue(session)
    const started = await startPhoneApproval(LINK, 'settings')
    expect(started).toEqual({ ok: true, session })
    const [scanned, account, deps] = fake.createPhoneApproval.mock.calls[0]
    expect(scanned).toBe(LINK)
    expect(account).toMatchObject({
      accountId: 'account-1',
      deviceName: 'iPhone 17',
    })
    expect(deps.origins).toEqual(['https://app.witnesswork.app'])
    expect(session.claim).toHaveBeenCalled()
    expect(useApprovalDebug.getState().session).toBe(session)
    expect(captured()).toEqual([['approval_started', { entry: 'settings' }]])
  })

  it('says why it can’t start, without claiming', async () => {
    fake.connect.mockRejectedValue(
      new AccountSessionError('attestation', { attestation: 'temporary' })
    )
    expect(await startPhoneApproval(LINK, 'settings')).toEqual({
      ok: false,
      problem: 'verifyLater',
    })
    expect(fake.createPhoneApproval).not.toHaveBeenCalled()
    expect(captured()).toContainEqual([
      'approval_failed',
      { reason: 'verifyLater' },
    ])
  })

  it('needs a binary that can keep an account key', async () => {
    fake.available.mockReturnValue(false)
    expect(await startPhoneApproval(LINK, 'settings')).toEqual({
      ok: false,
      problem: 'unsupported',
    })
    expect(fake.getOrCreate).not.toHaveBeenCalled()
  })

  it('reports a code refused before any claim', async () => {
    fake.createPhoneApproval.mockReturnValue(
      fakeSession({ step: 'invalid', problem: 'damaged' })
    )
    await startPhoneApproval(LINK, 'settings')
    expect(captured()).toContainEqual([
      'approval_failed',
      { reason: 'damaged' },
    ])
  })
})

describe('tracking an approval', () => {
  async function started() {
    const session = fakeSession({ step: 'claiming' })
    fake.createPhoneApproval.mockReturnValue(session)
    await startPhoneApproval(LINK, 'settings')
    vi.mocked(analytics.capture).mockClear()
    return session
  }

  it('reports the claim once, with the far hint', async () => {
    const session = await started()
    session.set(CONFIRM)
    // A YES that didn't get through goes back to confirm: not a new claim.
    session.set({ ...CONFIRM, step: 'sending' })
    session.set({ ...CONFIRM, sendFailed: true })
    expect(captured()).toEqual([['approval_claimed', { far: true }]])
  })

  it('reports No, a failure, and leaving', async () => {
    const declined = await started()
    declined.set(CONFIRM)
    declined.set({ step: 'declined', hello: HELLO })
    expect(captured()).toContainEqual(['approval_declined', {}])

    const failed = await started()
    failed.set({ step: 'failed', reason: 'used' })
    expect(captured()).toEqual([['approval_failed', { reason: 'used' }]])

    const left = await started()
    await endApproval(left as never)
    expect(captured()).toEqual([['approval_failed', { reason: 'left' }]])
  })
})

describe('approveBrowser', () => {
  async function confirming() {
    const session = fakeSession(CONFIRM)
    fake.createPhoneApproval.mockReturnValue(session)
    await startPhoneApproval(LINK, 'settings')
    vi.mocked(analytics.capture).mockClear()
    return session
  }

  it('sends the key once the owner confirms', async () => {
    const session = await confirming()
    const confirmOwner = vi.fn(async () => 'confirmed' as const)
    expect(await approveBrowser(session as never, { confirmOwner })).toBe(
      'sent'
    )
    expect(session.approve).toHaveBeenCalledTimes(1)
    expect(captured()).toEqual([['approval_approved', { auth: 'device' }]])
  })

  it('sends nothing when the owner check is cancelled or fails', async () => {
    const session = await confirming()
    for (const check of ['cancelled', 'failed'] as const) {
      const confirmOwner = vi.fn(async () => check)
      expect(await approveBrowser(session as never, { confirmOwner })).toBe(
        check
      )
    }
    const throws = vi.fn(async () => {
      throw new Error('LocalAuthentication unavailable')
    })
    expect(
      await approveBrowser(session as never, { confirmOwner: throws })
    ).toBe('failed')
    expect(session.approve).not.toHaveBeenCalled()
    expect(captured()).toEqual([])
  })

  it('doesn’t ask again for a YES after a send that didn’t get through', async () => {
    const session = await confirming()
    session.approve.mockImplementationOnce(async () => {
      session.set({ ...CONFIRM, sendFailed: true })
    })
    const confirmOwner = vi.fn(async () => 'noLock' as const)
    await approveBrowser(session as never, { confirmOwner })
    await approveBrowser(session as never, { confirmOwner })
    expect(confirmOwner).toHaveBeenCalledTimes(1)
    expect(session.approve).toHaveBeenCalledTimes(2)
    expect(captured()).toEqual([['approval_approved', { auth: 'none' }]])
  })
})
