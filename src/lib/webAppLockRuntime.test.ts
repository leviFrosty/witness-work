import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'web' }))
vi.mock('react-native', () => ({ Platform: platform }))
const analytics = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/passkeys', () => ({ getPasskey: vi.fn() }))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('@/lib/serverAccount/stepUpPrompt', () => ({
  onPasskeyStepUp: vi.fn(),
}))
const toast = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('@/stores/toasts', () => ({ toast }))
const settings = vi.hoisted(() => ({
  state: {
    enabled: true,
    requireAfter: 0,
    webCredentials: { rpId: 'app.witnesswork.app', ids: ['Y3JlZA'] } as {
      rpId: string
      ids: string[]
    } | null,
  },
}))
const session = vi.hoisted(() => ({ state: { locked: false } }))
vi.mock('@/stores/appLock', () => ({
  appLockDelayFor: (delay: number, web: boolean) =>
    web && delay === 0 ? 60 : delay,
  useAppLockSettings: {
    getState: () => ({
      ...settings.state,
      set: (next: object) => Object.assign(settings.state, next),
    }),
  },
  useAppLockSession: {
    getState: () => session.state,
    setState: (next: object) => Object.assign(session.state, next),
  },
}))

const { keepListedWebLockPasskeys, webUnlockFailureMessage } = await import(
  '@/lib/webAppLockRuntime'
)

beforeEach(() => {
  vi.clearAllMocks()
  settings.state.enabled = true
  settings.state.webCredentials = {
    rpId: 'app.witnesswork.app',
    ids: ['Y3JlZA'],
  }
  session.state.locked = false
})

describe('keepListedWebLockPasskeys', () => {
  it('turns the lock off, and says so, once none of its passkeys is listed', () => {
    keepListedWebLockPasskeys(['b3RoZXI'])
    expect(settings.state).toMatchObject({
      enabled: false,
      webCredentials: null,
    })
    expect(analytics.capture).toHaveBeenCalledWith('app_lock_changed', {
      enabled: false,
      method: 'passkey',

      require_after: 60,
    })
    expect(toast.info).toHaveBeenCalledWith('webAppLock_turnedOff', {
      message: 'webAppLock_turnedOffMessage',
    })
  })

  it('never turns the lock off, or opens it, while it’s locked', () => {
    session.state.locked = true
    keepListedWebLockPasskeys([])
    expect(settings.state).toMatchObject({
      enabled: true,
      webCredentials: { ids: ['Y3JlZA'] },
    })
    expect(session.state.locked).toBe(true)
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('keeps the lock while one of its passkeys is listed', () => {
    keepListedWebLockPasskeys(['Y3JlZA', 'b3RoZXI'])
    expect(settings.state.enabled).toBe(true)
  })
})

describe('webUnlockFailureMessage', () => {
  it('names the failure, or says the unlock didn’t work', () => {
    expect(
      webUnlockFailureMessage({ status: 'refused', reason: 'wrong_credential' })
    ).toBe('webAppLock_wrongPasskey')
    expect(
      webUnlockFailureMessage({ status: 'failed', reason: 'no_credentials' })
    ).toBe('webAppLock_noPasskeyHere')
    expect(
      webUnlockFailureMessage({ status: 'refused', reason: 'origin' })
    ).toBe('webAppLock_unlockFailedMessage')
  })
})
