import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The app's Sign In with a Passkey around the flow: Buddies and the backup
// after a passkey unlocks, analytics, and how long a passkey that couldn't
// unlock waits for the key.

const fake = vi.hoisted(() => ({
  signIn: vi.fn(),
  keyArrived: vi.fn(),
  pending: vi.fn(),
  forget: vi.fn(),
  onEvent: null as null | ((event: unknown) => void),
  joinBuddiesHere: vi.fn(),
  offerRestore: vi.fn(),
  capture: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('@/constants/apis', () => ({ default: { accounts: 'https://t' } }))
vi.mock('@/lib/serverAccount/passkeyClient', () => ({
  startPasskeySignIn: vi.fn(),
  finishPasskeySignIn: vi.fn(),
}))
vi.mock('@/app/account/accountKey', () => ({
  accountKey: { peek: vi.fn(), lossIfReplaced: vi.fn() },
  replaceAccountKey: vi.fn(),
}))
vi.mock('@/app/account/backupRestore', () => ({
  offerRestore: fake.offerRestore,
}))
vi.mock('@/app/account/passkeys', () => ({ phonePasskeyGet: vi.fn() }))
vi.mock('@/app/buddies/joinBuddiesHere', () => ({
  joinBuddiesHere: fake.joinBuddiesHere,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: fake.capture } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/passkeys/rpId', () => ({ PASSKEY_RP_ID: 'example.test' }))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {},
  serverAccount: { lastAccountId: () => null },
}))
vi.mock('@/lib/serverAccount/passkeyServer', () => ({
  accountPasskeyDeps: vi.fn(),
}))
vi.mock('@/lib/serverAccount/phonePasskeySignIn', () => ({
  createPhonePasskeySignIn: (deps: { onEvent: (event: unknown) => void }) => {
    fake.onEvent = deps.onEvent
    return {
      signIn: fake.signIn,
      keyArrived: fake.keyArrived,
      pending: fake.pending,
      forget: fake.forget,
    }
  },
}))
vi.mock('@/stores/toasts', () => ({ toast: { success: fake.toastSuccess } }))
vi.mock('@/features/buddies/lib/engine', () => ({
  BuddyRemovalPendingError: class extends Error {},
}))

import {
  holdPasskeySignIn,
  passkeyKeyArrived,
  signInWithPhonePasskey,
} from './passkeySignIn'

const unlocked = { status: 'unlocked', replaced: 'replaced', rejoined: false }

const run = (buddiesEnabled = true) =>
  signInWithPhonePasskey({
    entry: 'onboarding',
    confirmReplace: async () => true,
    buddiesEnabled,
  })

beforeEach(() => {
  vi.clearAllMocks()
  fake.joinBuddiesHere.mockResolvedValue(true)
  fake.offerRestore.mockResolvedValue({ outcome: 'synced', combine: false })
  fake.pending.mockReturnValue(null)
})

afterEach(() => vi.useRealTimers())

describe('signInWithPhonePasskey', () => {
  it('starts Buddies and offers the backup once the passkey unlocks', async () => {
    fake.signIn.mockResolvedValue(unlocked)
    await expect(run()).resolves.toEqual({
      status: 'done',
      buddiesStarted: true,
      restore: { outcome: 'synced', combine: false },
      rejoined: false,
    })
    expect(fake.joinBuddiesHere).toHaveBeenCalledWith('passkey')
    expect(fake.offerRestore).toHaveBeenCalledWith('passkey')
  })

  it('offers no backup back on the account this phone was on', async () => {
    fake.signIn.mockResolvedValue({ ...unlocked, rejoined: true })
    await expect(run()).resolves.toMatchObject({
      status: 'done',
      restore: { outcome: 'skipped' },
      rejoined: true,
    })
    expect(fake.offerRestore).not.toHaveBeenCalled()
  })

  it("leaves Buddies alone where it's off", async () => {
    fake.signIn.mockResolvedValue(unlocked)
    await expect(run(false)).resolves.toMatchObject({ buddiesStarted: false })
    expect(fake.joinBuddiesHere).not.toHaveBeenCalled()
  })

  it("still signs in when the backup can't be offered", async () => {
    fake.signIn.mockResolvedValue(unlocked)
    fake.offerRestore.mockRejectedValue(new Error('offline'))
    await expect(run()).resolves.toMatchObject({
      status: 'done',
      restore: { outcome: 'failed', reason: 'server' },
    })
  })

  it.each([
    { status: 'cantUnlock', reason: 'noWraps', prf: true },
    { status: 'declined' },
  ])('hands back $status without the backup', async (result) => {
    fake.signIn.mockResolvedValue(result)
    await expect(run()).resolves.toEqual(result)
    expect(fake.offerRestore).not.toHaveBeenCalled()
  })

  it.each([
    { status: 'cancelled' },
    { status: 'failed', reason: 'offline', serverReason: null },
  ])(
    'hands back $status with the passkey still waiting from before',
    async (result) => {
      fake.signIn.mockResolvedValue(result)
      fake.pending.mockReturnValue({ reason: 'noWraps', prf: true })
      await expect(run()).resolves.toEqual({
        ...result,
        waiting: { reason: 'noWraps', prf: true },
      })
      expect(fake.forget).not.toHaveBeenCalled()
      expect(fake.offerRestore).not.toHaveBeenCalled()
    }
  )

  it('records analytics with the platform and entry, and no ids', async () => {
    fake.signIn.mockImplementation(async () => {
      fake.onEvent?.({ type: 'started' })
      fake.onEvent?.({
        type: 'succeeded',
        unlocked: false,
        reason: 'noPrf',
        prf: false,
      })
      return { status: 'cantUnlock', reason: 'noPrf', prf: false }
    })
    await run()
    fake.onEvent?.({
      type: 'failed',
      reason: 'passkey_failed',
      serverReason: 'signature',
    })
    fake.onEvent?.({ type: 'wrap', outcome: 'saved' })
    const base = { platform: 'android', entry: 'onboarding' }
    expect(fake.capture.mock.calls).toEqual([
      ['passkey_sign_in_started', base],
      [
        'passkey_sign_in_succeeded',
        { ...base, unlocked: false, cant_unlock: 'noPrf', prf: false },
      ],
      [
        'passkey_sign_in_failed',
        { ...base, reason: 'passkey_failed', server_reason: 'signature' },
      ],
      ['passkey_sign_in_wrap', { ...base, outcome: 'saved' }],
    ])
  })
})

describe('the passkey that waits for the key', () => {
  it('is forgotten once no sign-in screen holds it', async () => {
    vi.useFakeTimers()
    const releaseFirst = holdPasskeySignIn()
    const releaseSecond = holdPasskeySignIn()
    fake.forget.mockClear()
    releaseFirst()
    vi.advanceTimersByTime(5_000)
    expect(fake.forget).not.toHaveBeenCalled()
    releaseSecond()
    vi.advanceTimersByTime(5_000)
    expect(fake.forget).toHaveBeenCalled()
  })

  it('survives moving from one sign-in screen to the next', async () => {
    vi.useFakeTimers()
    const release = holdPasskeySignIn()
    fake.forget.mockClear()
    release()
    const next = holdPasskeySignIn()
    vi.advanceTimersByTime(5_000)
    expect(fake.forget).not.toHaveBeenCalled()
    next()
  })

  it('keeps its 10 minutes when trying another passkey is cancelled', async () => {
    vi.useFakeTimers()
    fake.signIn.mockResolvedValueOnce({
      status: 'cantUnlock',
      reason: 'noWraps',
      prf: true,
    })
    await run()
    vi.advanceTimersByTime(6 * 60_000)
    fake.signIn.mockResolvedValueOnce({ status: 'cancelled' })
    await run()
    fake.forget.mockClear()
    vi.advanceTimersByTime(4 * 60_000)
    expect(fake.forget).toHaveBeenCalled()
  })

  it('is forgotten after 10 minutes', async () => {
    vi.useFakeTimers()
    fake.signIn.mockResolvedValue({
      status: 'cantUnlock',
      reason: 'noWraps',
      prf: true,
    })
    await run()
    fake.forget.mockClear()
    vi.advanceTimersByTime(10 * 60_000)
    expect(fake.forget).toHaveBeenCalled()
  })

  it('says so once its wrap is saved', async () => {
    fake.pending.mockReturnValue({ reason: 'noWraps', prf: true })
    fake.keyArrived.mockResolvedValue('saved')
    const key = new Uint8Array(32)
    await expect(passkeyKeyArrived(key)).resolves.toBe('saved')
    expect(fake.keyArrived).toHaveBeenCalledWith(key)
    expect(fake.toastSuccess).toHaveBeenCalledWith('passkeySignIn_unlocksNow')
  })

  it("says nothing when it couldn't save", async () => {
    fake.pending.mockReturnValue({ reason: 'noWraps', prf: true })
    fake.keyArrived.mockResolvedValue('not_saved')
    await passkeyKeyArrived(new Uint8Array(32))
    expect(fake.toastSuccess).not.toHaveBeenCalled()
  })

  it('does nothing without a passkey waiting', async () => {
    await expect(passkeyKeyArrived(new Uint8Array(32))).resolves.toBeNull()
    expect(fake.keyArrived).not.toHaveBeenCalled()
  })
})
