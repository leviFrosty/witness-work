import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sync copy names iCloud unless the device syncs through Google Drive.

const load = async () => {
  const { syncKey } = await import('@/lib/syncCopy')
  const { registerAndroidSyncTransport } = await import(
    '@/lib/syncTransport/registry'
  )
  return { syncKey, registerAndroidSyncTransport }
}

beforeEach(() => {
  vi.resetModules()
})

describe('syncKey', () => {
  it('keeps the iCloud string when no Drive transport is registered', async () => {
    const { syncKey } = await load()
    expect(syncKey('iCloudSync')).toBe('iCloudSync')
    expect(syncKey('iCloudEnableLabel')).toBe('iCloudEnableLabel')
  })

  it('uses the Android variant on Google Drive, where one exists', async () => {
    const { syncKey, registerAndroidSyncTransport } = await load()
    registerAndroidSyncTransport({ kind: 'google-drive' } as never)
    expect(syncKey('iCloudSync')).toBe('iCloudSyncAndroid')
    expect(syncKey('iCloudEnableLabel')).toBe('iCloudEnableLabelAndroid')
    // Neutral wording has no variant.
    expect(syncKey('iCloudSyncNow')).toBe('iCloudSyncNow')
  })

  it('uses the Cloud variant on Cloud Sync, where one exists', async () => {
    const { syncKey, registerAndroidSyncTransport } = await load()
    const { registerCloudSyncCopy } = await import(
      '@/lib/syncTransport/registry'
    )
    registerAndroidSyncTransport({ kind: 'google-drive' } as never)
    registerCloudSyncCopy({ offered: () => true, used: () => true })
    expect(syncKey('iCloudSync')).toBe('iCloudSyncCloud')
    // No Cloud variant: Drive's, then the base string.
    expect(syncKey('iCloudSyncNow')).toBe('iCloudSyncNow')
    const { platformSyncKey, syncSettingsTitleKey } = await import(
      '@/lib/syncCopy'
    )
    expect(platformSyncKey('iCloudSync')).toBe('iCloudSyncAndroid')
    expect(syncSettingsTitleKey()).toBe('syncSettingsTitle')
  })
})

describe('optionSyncKey', () => {
  it('names the option asked for, not the one in use', async () => {
    const { registerAndroidSyncTransport } = await load()
    const { optionSyncKey } = await import('@/lib/syncCopy')
    registerAndroidSyncTransport({ kind: 'google-drive' } as never)
    expect(optionSyncKey('iCloudUnavailable_description', 'cloud')).toBe(
      'iCloudUnavailable_descriptionCloud'
    )
    expect(optionSyncKey('iCloudUnavailable_description', 'platform')).toBe(
      'iCloudUnavailable_descriptionAndroid'
    )
    // No Cloud variant: the platform's wording.
    expect(optionSyncKey('iCloudSyncNow', 'cloud')).toBe('iCloudSyncNow')
  })
})
