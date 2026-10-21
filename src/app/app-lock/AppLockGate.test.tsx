import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'

const setAppSwitcherHidden = vi.hoisted(() => vi.fn())
vi.mock('../../../modules/app-switcher-privacy', () => ({
  setAppSwitcherHidden,
}))
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: vi.fn() }),
  },
  BackHandler: { exitApp: vi.fn() },
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
  authenticateAppLock: vi.fn(() => new Promise(() => {})),
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
import { useAppLockSettings } from '@/stores/appLock'

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  setAppSwitcherHidden.mockClear()
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
