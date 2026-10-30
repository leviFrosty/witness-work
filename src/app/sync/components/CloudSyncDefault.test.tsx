import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  isSupporter: true,
  cloudSyncEntitled: null as boolean | null,
  setState: vi.fn(),
  appStateListeners: [] as Array<(state: string) => void>,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appStateListeners.push(listener)
      return {
        remove: () => {
          runtime.appStateListeners = runtime.appStateListeners.filter(
            (l) => l !== listener
          )
        },
      }
    },
  },
}))
vi.mock('@/hooks/useIsSupporter', () => ({
  default: () => ({ isSupporter: runtime.isSupporter }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: Object.assign(
    () => ({
      iCloudSyncEnabled: false,
      iCloudSyncSetByUser: false,
      syncProvider: null,
      cloudSyncConfig: { enabled: true, entitlement: 'supporter' },
      cloudSyncEntitled: runtime.cloudSyncEntitled,
      onboardingComplete: true,
    }),
    { setState: runtime.setState, getState: () => ({ set: vi.fn() }) }
  ),
}))
vi.mock('@/app/sync/iCloudSync', () => ({
  iCloudSync: {
    resolveInitialEnable: vi.fn(async () => ({ outcome: 'seed' })),
    applySeedEnable: vi.fn(async () => {}),
    applyPullEnable: vi.fn(),
  },
}))
vi.mock('@/app/sync/cloudSync', () => ({ prepareCloudSync: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/syncTransport', () => ({ hasSyncTransport: () => true }))
vi.mock('@/lib/syncTransport/provider', () => ({
  addActiveRemoteChangeListener: () => ({ remove: () => {} }),
  cloudSyncOffered: () => true,
}))

let renderer: ReactTestRenderer | null = null

beforeEach(() => {
  vi.clearAllMocks()
  runtime.isSupporter = true
  runtime.cloudSyncEntitled = null
  runtime.appStateListeners = []
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

const notEntitled = {
  outcome: 'not_entitled',
  status: {
    enabled: true,
    entitled: false,
    entitlement: 'supporter',
    supporter: false,
    supporterCheckFailed: true,
    photos: true,
  },
} as const

describe('CloudSyncDefault', () => {
  it('tries a Supporter again when the server couldn’t confirm them', async () => {
    const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
    const { prepareCloudSync } = await import('@/app/sync/cloudSync')
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    vi.mocked(prepareCloudSync)
      .mockResolvedValueOnce(notEntitled)
      .mockResolvedValueOnce({ outcome: 'ready', status: notEntitled.status })

    await act(async () => {
      renderer = create(<CloudSyncDefault />)
    })
    expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()
    expect(runtime.appStateListeners).toHaveLength(1)

    // RevenueCat is back by the next foreground.
    await act(async () => {
      runtime.appStateListeners.forEach((listener) => listener('active'))
    })
    expect(runtime.setState).toHaveBeenCalledWith({ syncProvider: 'cloud' })
    expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith('supporter_default')
  })

  it('stops asking when a device that isn’t a Supporter isn’t entitled', async () => {
    runtime.isSupporter = false
    // Entitled when last read, so the default tries once.
    runtime.cloudSyncEntitled = true
    const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
    const { prepareCloudSync } = await import('@/app/sync/cloudSync')
    vi.mocked(prepareCloudSync).mockResolvedValueOnce(notEntitled)

    await act(async () => {
      renderer = create(<CloudSyncDefault />)
    })
    expect(prepareCloudSync).toHaveBeenCalledTimes(1)
    expect(runtime.appStateListeners).toHaveLength(0)
  })
})
