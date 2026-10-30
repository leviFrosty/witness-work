import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'

const setAppSwitcherHidden = vi.hoisted(() => vi.fn())
vi.mock('../../../modules/app-switcher-privacy', () => ({
  setAppSwitcherHidden,
  revealAfterUnlock: vi.fn(),
}))
const askedAtLaunch = vi.hoisted(() => ({ value: false }))
vi.mock('@/app/app-lock/unlock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./unlock')>()),
  wasAskedAtLaunch: () => askedAtLaunch.value,
}))
vi.mock('@/app/launch/layoutDirection', () => ({
  isLayoutDirectionReloadDue: () => false,
}))
const setFirstScreenCovered = vi.hoisted(() => vi.fn())
vi.mock('@/app/launch/useAfterLaunch', () => ({ setFirstScreenCovered }))
vi.mock('@/stores/mmkv', () => ({ isStorageLocked: () => false }))
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: vi.fn() }),
  },
  BackHandler: { exitApp: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('@/components/ui/FullWindowOverlay', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/app/app-lock/AppLockScreen', () => ({ default: () => null }))
vi.mock('@/hooks/useTakeoverTurn', () => ({ useTakeoverHold: vi.fn() }))
vi.mock('@/hooks/useAppLockAvailability', () => ({
  useAppLockAvailability: () => null,
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/appLock', () => ({
  authenticateAppLock: vi.fn(() => Promise.resolve('cancelled')),
  shouldRelock: vi.fn(() => false),
}))
vi.mock('@/stores/appLock', async () => {
  const { create } = await import('zustand')
  return {
    useAppLockSettings: create(() => ({ enabled: false, requireAfter: 0 })),
    useAppLockSession: create(() => ({ locked: false, authenticating: false })),
  }
})

import AppLockGate from './AppLockGate'
import { authenticateAppLock } from '@/lib/appLock'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  setAppSwitcherHidden.mockClear()
  setFirstScreenCovered.mockClear()
  vi.mocked(authenticateAppLock).mockClear()
  useAppLockSettings.setState({ enabled: false })
  useAppLockSession.setState({ locked: false })
  askedAtLaunch.value = false
})

it('hides the app in the app switcher only while App Lock is on', () => {
  useAppLockSettings.setState({ enabled: true })
  act(() => {
    renderer = create(<AppLockGate />)
  })
  expect(setAppSwitcherHidden).toHaveBeenLastCalledWith(true)

  act(() => {
    useAppLockSettings.setState({ enabled: false })
  })
  expect(setAppSwitcherHidden).toHaveBeenLastCalledWith(false)
})

it('tells launch work while the lock covers the first screen', () => {
  useAppLockSettings.setState({ enabled: true })
  useAppLockSession.setState({ locked: true })
  act(() => {
    renderer = create(<AppLockGate />)
  })
  expect(setFirstScreenCovered).toHaveBeenLastCalledWith(true)

  act(() => {
    useAppLockSession.setState({ locked: false })
  })
  expect(setFirstScreenCovered).toHaveBeenLastCalledWith(false)
})

it('asks to unlock when it mounts locked in the foreground', () => {
  useAppLockSettings.setState({ enabled: true })
  useAppLockSession.setState({ locked: true })
  act(() => {
    renderer = create(<AppLockGate />)
  })
  expect(authenticateAppLock).toHaveBeenCalledTimes(1)
})

it("doesn't ask again as it appears when launch already asked", () => {
  askedAtLaunch.value = true
  useAppLockSettings.setState({ enabled: true })
  useAppLockSession.setState({ locked: true })
  act(() => {
    renderer = create(<AppLockGate />)
  })
  expect(authenticateAppLock).not.toHaveBeenCalled()
})
