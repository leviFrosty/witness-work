import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationItem } from '@/types/notifications'

// The web syncs through Cloud Sync with no platform transport, so these notices
// key on the sync engine, not on iCloud or Drive.

const runtime = vi.hoisted(() => ({
  engine: true,
  prefs: {
    iCloudResetAdoptedNotice: null as null | {
      epochId: string
      at: number
      deviceName?: string
    },
    iCloudSyncNeedsResolution: false,
  },
}))

vi.mock('lucide-react-native', () => ({ Cloud: () => null }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/syncCopy', () => ({ syncKey: (key: string) => key }))
vi.mock('@/lib/syncTransport/platform', () => ({
  hasSyncTransport: () => false,
  hasSyncEngine: () => runtime.engine,
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: Object.assign(
    (select: (state: typeof runtime.prefs) => unknown) => select(runtime.prefs),
    {
      getState: () => runtime.prefs,
      setState: (partial: object) => Object.assign(runtime.prefs, partial),
    }
  ),
}))

const { useSyncResetNotification } = await import(
  '@/app/sync/useSyncResetNotification'
)
const { useSyncResolutionNotification } = await import(
  '@/app/sync/useSyncResolutionNotification'
)

function read(hook: () => NotificationItem | null): NotificationItem | null {
  let item: NotificationItem | null = null
  function Probe() {
    item = hook()
    return null
  }
  act(() => {
    create(<Probe />)
  })
  return item
}

describe('sync notices on the web', () => {
  beforeEach(() => {
    runtime.engine = true
    runtime.prefs.iCloudResetAdoptedNotice = { epochId: 'e1', at: 1 }
    runtime.prefs.iCloudSyncNeedsResolution = true
  })

  it('shows the rebuilt-data notice where only the engine runs', () => {
    expect(read(useSyncResetNotification)?.id).toBe('icloud:reset-adopted:e1')
  })

  it('shows the choose-how-to-start notice where only the engine runs', () => {
    expect(read(useSyncResolutionNotification)?.id).toBe('icloud:resolve')
  })

  it('shows neither without a sync engine', () => {
    runtime.engine = false
    expect(read(useSyncResetNotification)).toBeNull()
    expect(read(useSyncResolutionNotification)).toBeNull()
  })
})
