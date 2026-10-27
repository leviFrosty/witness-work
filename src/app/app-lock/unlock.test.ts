import { beforeEach, expect, it, vi } from 'vitest'

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
import { promptUnlock, promptUnlockAtLaunch, wasAskedAtLaunch } from './unlock'

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
