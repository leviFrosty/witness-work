import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  setPreferences: vi.fn(),
  isSupporter: true,
  installedBeforeFreeSync: true,
  remoteChangeListeners: [] as Array<() => void>,
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
      installedBeforeFreeSync: runtime.installedBeforeFreeSync,
    }),
    { getState: () => ({ set: runtime.setPreferences }) }
  ),
}))
vi.mock('@/app/sync/iCloudSync', () => ({
  iCloudSync: {
    resolveInitialEnable: vi.fn(),
    applySeedEnable: vi.fn(async () => {}),
    applyPullEnable: vi.fn(),
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('../../../../modules/icloud-bridge', () => ({
  addRemoteChangeListener: (listener: () => void) => {
    runtime.remoteChangeListeners.push(listener)
    return {
      remove: () => {
        runtime.remoteChangeListeners = runtime.remoteChangeListeners.filter(
          (l) => l !== listener
        )
      },
    }
  },
}))

const remote = { deviceId: 'phone' }

let renderer: ReactTestRenderer | null = null

beforeEach(() => {
  vi.clearAllMocks()
  runtime.isSupporter = true
  runtime.installedBeforeFreeSync = true
  runtime.remoteChangeListeners = []
  runtime.appStateListeners = []
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('PlatformSyncDefault', () => {
  it('waits for a backup still downloading instead of seeding', async () => {
    const { default: PlatformSyncDefault } = await import(
      './PlatformSyncDefault'
    )
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    vi.mocked(iCloudSync.resolveInitialEnable)
      .mockResolvedValueOnce({ outcome: 'incomplete', reason: 'downloading' })
      .mockResolvedValueOnce({ outcome: 'pull', remote } as never)

    await act(async () => {
      renderer = create(<PlatformSyncDefault />)
    })
    expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()
    expect(iCloudSync.applyPullEnable).not.toHaveBeenCalled()

    // The download lands and the metadata query reports it.
    await act(async () => {
      runtime.remoteChangeListeners.forEach((listener) => listener())
    })

    expect(iCloudSync.applyPullEnable).toHaveBeenCalledWith(
      remote,
      'supporter_default'
    )
    expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()
    // Decided; later remote changes don't re-run it.
    expect(runtime.remoteChangeListeners).toHaveLength(0)
    expect(runtime.appStateListeners).toHaveLength(0)
  })

  it('decides again at the next foreground', async () => {
    const { default: PlatformSyncDefault } = await import(
      './PlatformSyncDefault'
    )
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    // A slow initial scan of an empty container: no file will land to report.
    vi.mocked(iCloudSync.resolveInitialEnable)
      .mockResolvedValueOnce({ outcome: 'incomplete', reason: 'scan' })
      .mockResolvedValueOnce({ outcome: 'seed' })

    await act(async () => {
      renderer = create(<PlatformSyncDefault />)
    })
    expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()

    await act(async () => {
      runtime.appStateListeners.forEach((listener) => listener('active'))
    })

    expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith('supporter_default')
  })
})

it('shows a persistent resolution prompt instead of silently giving up on a conflict', async () => {
  const { default: PlatformSyncDefault } = await import('./PlatformSyncDefault')
  const { iCloudSync } = await import('@/app/sync/iCloudSync')
  vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
    outcome: 'conflict',
    remote,
  } as never)
  await act(async () => {
    renderer = create(<PlatformSyncDefault />)
  })
  expect(runtime.setPreferences).toHaveBeenCalledWith({
    iCloudSyncNeedsResolution: true,
  })
  expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()
  expect(iCloudSync.applyPullEnable).not.toHaveBeenCalled()
})

describe('who gets it (ADR 0040 §2)', () => {
  it('turns sync on for a new install that isn’t a Supporter', async () => {
    runtime.isSupporter = false
    runtime.installedBeforeFreeSync = false
    const { default: PlatformSyncDefault } = await import(
      './PlatformSyncDefault'
    )
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
      outcome: 'seed',
    })
    await act(async () => {
      renderer = create(<PlatformSyncDefault />)
    })
    expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith('supporter_default')
  })

  it('leaves an existing install that isn’t a Supporter as it was', async () => {
    runtime.isSupporter = false
    const { default: PlatformSyncDefault } = await import(
      './PlatformSyncDefault'
    )
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    await act(async () => {
      renderer = create(<PlatformSyncDefault />)
    })
    expect(iCloudSync.resolveInitialEnable).not.toHaveBeenCalled()
  })
})
