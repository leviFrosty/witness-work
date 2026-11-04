import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  os: 'ios',
  appState: 'active',
  storageLocked: false,
  authenticate: (() => Promise.resolve('success')) as () => Promise<string>,
  reloadDue: false,
  reveals: 0,
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
  AppState: {
    get currentState() {
      return runtime.appState
    },
  },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
// The web's lock, which phones never use.
const webLock = vi.hoisted(() => ({ unlock: vi.fn() }))
const turnOffWebAppLock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/webAppLockRuntime', () => ({
  webAppLock: webLock,
  turnOffWebAppLock,
  webUnlockFailureMessage: (result: { reason: string }) =>
    `failure:${result.reason}`,
}))
vi.mock('@/stores/toasts', () => ({ toast: { error: vi.fn() } }))
// Listing the account's passkeys checks the lock's against them.
const loadPasskeys = vi.hoisted(() => vi.fn(async () => ({ passkeys: [] })))
vi.mock('@/app/account/passkeys', () => ({ loadPasskeys }))
vi.mock('@/lib/appLock', () => ({
  authenticateAppLock: vi.fn(() => runtime.authenticate()),
}))
vi.mock('@/stores/mmkv', () => ({
  isStorageLocked: () => runtime.storageLocked,
}))
vi.mock('@/stores/appLock', async () => {
  const { create } = await import('zustand')
  return {
    useAppLockSettings: create(() => ({ enabled: true, requireAfter: 0 })),
    useAppLockSession: create(() => ({ locked: true, authenticating: false })),
  }
})
vi.mock('@/app/launch/layoutDirection', () => ({
  isLayoutDirectionReloadDue: () => runtime.reloadDue,
}))
vi.mock('../../../modules/app-switcher-privacy', () => ({
  revealAfterUnlock: () => runtime.reveals++,
}))

import { authenticateAppLock } from '@/lib/appLock'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import {
  promptUnlock,
  promptUnlockAtLaunch,
  unlockWebAppLock,
  wasAskedAtLaunch,
} from './unlock'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  runtime.os = 'ios'
  runtime.appState = 'active'
  runtime.storageLocked = false
  runtime.authenticate = () => Promise.resolve('success')
  runtime.reloadDue = false
  runtime.reveals = 0
  vi.mocked(authenticateAppLock).mockClear()
  useAppLockSettings.setState({ enabled: true })
  useAppLockSession.setState({ locked: true })
})

it('asks at launch on iOS and opens the app on success', async () => {
  promptUnlockAtLaunch()
  await flush()
  expect(authenticateAppLock).toHaveBeenCalledTimes(1)
  expect(useAppLockSession.getState().locked).toBe(false)
  expect(wasAskedAtLaunch()).toBe(true)
  // Shows the app without waiting out Face ID's success animation.
  expect(runtime.reveals).toBe(1)
})

it.each([
  ['on Android', () => (runtime.os = 'android')],
  ['with App Lock off', () => useAppLockSettings.setState({ enabled: false })],
  [
    'once already unlocked',
    () => useAppLockSession.setState({ locked: false }),
  ],
  ['in the background', () => (runtime.appState = 'background')],
  ['before the first device unlock', () => (runtime.storageLocked = true)],
  ['when reloading for its layout direction', () => (runtime.reloadDue = true)],
])("doesn't ask at launch %s", async (_, arrange) => {
  arrange()
  promptUnlockAtLaunch()
  await flush()
  expect(authenticateAppLock).not.toHaveBeenCalled()
})

it('asks once at a time', async () => {
  let finish: (result: string) => void = () => {}
  runtime.authenticate = () => new Promise((resolve) => (finish = resolve))
  void promptUnlock()
  void promptUnlock()
  expect(authenticateAppLock).toHaveBeenCalledTimes(1)
  finish('success')
  await flush()
  useAppLockSession.setState({ locked: true })
  const again = promptUnlock()
  expect(authenticateAppLock).toHaveBeenCalledTimes(2)
  finish('cancelled')
  await again
})

it('stays locked and covered when cancelled', async () => {
  runtime.authenticate = () => Promise.resolve('cancelled')
  await promptUnlock()
  expect(useAppLockSession.getState().locked).toBe(true)
  expect(runtime.reveals).toBe(0)
})

it('can ask again after a prompt that failed outright', async () => {
  runtime.authenticate = () => Promise.reject(new Error('no context'))
  await expect(promptUnlock()).rejects.toThrow()
  expect(useAppLockSession.getState().locked).toBe(true)
  runtime.authenticate = () => Promise.resolve('success')
  await promptUnlock()
  expect(useAppLockSession.getState().locked).toBe(false)
})

it('opens a device with no passcode rather than trapping the user', async () => {
  runtime.authenticate = () => Promise.resolve('unavailable')
  await promptUnlock()
  expect(useAppLockSession.getState().locked).toBe(false)
})

describe('the web’s unlock', () => {
  beforeEach(() => {
    runtime.os = 'web'
    webLock.unlock.mockReset()
    turnOffWebAppLock.mockClear()
    loadPasskeys.mockClear()
    useAppLockSession.setState({ locked: true })
  })

  it('opens on the account’s passkey', async () => {
    webLock.unlock.mockResolvedValue({ status: 'unlocked' })
    expect(await unlockWebAppLock()).toBeNull()
    expect(useAppLockSession.getState().locked).toBe(false)
  })

  it('checks the account’s passkeys once unlocked, so one removed elsewhere is noticed then', async () => {
    webLock.unlock.mockResolvedValue({ status: 'unlocked' })
    await unlockWebAppLock()
    await vi.waitFor(() => expect(loadPasskeys).toHaveBeenCalledOnce())

    // Offline or failing, the lock stays as it is.
    useAppLockSession.setState({ locked: true })
    loadPasskeys.mockRejectedValueOnce(new Error('offline'))
    expect(await unlockWebAppLock()).toBeNull()
    await flush()
  })

  it('never lists them while it stays locked', async () => {
    for (const result of [
      { status: 'cancelled' },
      { status: 'noCredentials' },
      { status: 'refused', reason: 'wrong_credential' },
    ]) {
      webLock.unlock.mockResolvedValue(result)
      await unlockWebAppLock()
    }
    await flush()
    expect(loadPasskeys).not.toHaveBeenCalled()
  })

  it('stays locked when the passkey prompt closes, and says so: a browser can’t tell a cancel from no passkey here', async () => {
    webLock.unlock.mockResolvedValue({ status: 'cancelled' })
    expect(await unlockWebAppLock()).toBe('webAppLock_unlockStopped')
    expect(useAppLockSession.getState().locked).toBe(true)
  })

  it('stays locked and says why on the lock screen itself', async () => {
    for (const result of [
      { status: 'failed', reason: 'no_credentials' },
      { status: 'refused', reason: 'wrong_credential' },
    ]) {
      webLock.unlock.mockResolvedValue(result)
      expect(await unlockWebAppLock()).toBe(`failure:${result.reason}`)
      expect(useAppLockSession.getState().locked).toBe(true)
    }
  })

  it('never turns itself off with no passkey to unlock with: only Sign Out is left', async () => {
    webLock.unlock.mockResolvedValue({ status: 'noCredentials' })
    expect(await unlockWebAppLock()).toBe('webAppLock_noKeptPasskey')
    expect(useAppLockSession.getState().locked).toBe(true)
    expect(useAppLockSettings.getState().enabled).toBe(true)
    expect(turnOffWebAppLock).not.toHaveBeenCalled()
  })
})
