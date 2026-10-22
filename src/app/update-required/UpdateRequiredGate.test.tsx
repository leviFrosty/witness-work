import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ BackHandler: { exitApp: vi.fn() } }))
vi.mock('@/components/ui/FullWindowOverlay', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/app/update-required/UpdateRequiredScreen', () => ({
  default: () => 'update-required',
}))
vi.mock('@/hooks/useTakeoverTurn', () => ({ useTakeoverHold: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: () => ({ remove: vi.fn() }),
}))
vi.mock('@/lib/http/online', () => ({
  addReconnectListener: () => ({ remove: vi.fn() }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/storeListing', () => ({ openStoreListing: vi.fn() }))
vi.mock('@/lib/appUpdate', async () => {
  const { create } = await import('zustand')
  return {
    APP_CONFIG_MIN_INTERVAL_MS: 60_000,
    checkAppConfig: vi.fn(() => Promise.resolve()),
    useUpdateRequired: create(() => ({
      required: {
        source: 'config',
        currentVersion: '1.0.0',
        minVersion: '2.0.0',
      },
    })),
  }
})
vi.mock('@/stores/appLock', async () => {
  const { create } = await import('zustand')
  return {
    useAppLockSettings: create(() => ({ enabled: false })),
    useAppLockSession: create(() => ({ locked: false })),
  }
})

import UpdateRequiredGate from './UpdateRequiredGate'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it('waits under App Lock and covers the app once it unlocks', () => {
  useAppLockSettings.setState({ enabled: true })
  useAppLockSession.setState({ locked: true })
  act(() => {
    renderer = create(<UpdateRequiredGate />)
  })
  expect(renderer!.toJSON()).toBeNull()

  act(() => {
    useAppLockSession.setState({ locked: false })
  })
  expect(renderer!.toJSON()).toBe('update-required')
})

it('covers the app when App Lock is off', () => {
  useAppLockSettings.setState({ enabled: false })
  useAppLockSession.setState({ locked: true })
  act(() => {
    renderer = create(<UpdateRequiredGate />)
  })
  expect(renderer!.toJSON()).toBe('update-required')
})
