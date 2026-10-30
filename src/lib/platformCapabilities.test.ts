import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'ios' as string }))
vi.mock('react-native', () => ({ Platform: platform }))

import {
  hasCapability,
  type PlatformCapability,
} from '@/lib/platformCapabilities'

const all: PlatformCapability[] = [
  'homeScreenWidgets',
  'liveActivities',
  'siriShortcuts',
  'watchApps',
  'alternateAppIcons',
  'iCloudSync',
  'googleDriveSync',
  'calendarBridge',
  'deviceNotifications',
  'storeReview',
  'otaUpdates',
]
const on = (os: string) => {
  platform.OS = os
  return all.filter((capability) => hasCapability(capability))
}

describe('hasCapability', () => {
  beforeEach(() => {
    platform.OS = 'ios'
  })

  it('hides every feature with no web equivalent on the web', () => {
    expect(on('web')).toEqual([])
  })

  it('gives iOS its Apple-only features and Android its Google ones', () => {
    expect(on('ios')).toEqual(all.filter((c) => c !== 'googleDriveSync'))
    expect(on('android')).toEqual([
      'watchApps',
      'googleDriveSync',
      'calendarBridge',
      'deviceNotifications',
      'storeReview',
      'otaUpdates',
    ])
  })

  it('reads the platform when asked, not when loaded', () => {
    platform.OS = 'web'
    expect(hasCapability('deviceNotifications')).toBe(false)
    platform.OS = 'android'
    expect(hasCapability('deviceNotifications')).toBe(true)
  })
})
