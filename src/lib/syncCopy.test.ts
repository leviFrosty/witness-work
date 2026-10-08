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
})
