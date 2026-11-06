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
  'storeListings',
  'haptics',
  'appLock',
  'photoLibrarySave',
  'otaUpdates',
  'syncedPhotos',
  'scribeVoice',
  'scribePhotos',
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
    // App Lock unlocks with a passkey there.
    expect(on('web')).toEqual(['appLock'])
  })

  it('gives iOS its Apple-only features and Android its Google ones', () => {
    expect(on('ios')).toEqual(all.filter((c) => c !== 'googleDriveSync'))
    expect(on('android')).toEqual([
      'watchApps',
      'googleDriveSync',
      'calendarBridge',
      'deviceNotifications',
      'storeReview',
      'storeListings',
      'haptics',
      'appLock',
      'photoLibrarySave',
      'otaUpdates',
      'syncedPhotos',
      'scribeVoice',
      'scribePhotos',
    ])
  })

  it('keeps Scribe AI voice and photo input on the phones only', () => {
    platform.OS = 'web'
    expect(hasCapability('scribeVoice')).toBe(false)
    expect(hasCapability('scribePhotos')).toBe(false)
    for (const os of ['ios', 'android']) {
      platform.OS = os
      expect(hasCapability('scribeVoice')).toBe(true)
      expect(hasCapability('scribePhotos')).toBe(true)
    }
  })

  it('reads the platform when asked, not when loaded', () => {
    platform.OS = 'web'
    expect(hasCapability('deviceNotifications')).toBe(false)
    platform.OS = 'android'
    expect(hasCapability('deviceNotifications')).toBe(true)
  })
})
