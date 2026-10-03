import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enabled: true,
  readFiles: vi.fn(),
  scan: vi.fn(async () => true),
}))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: {} }))
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: '' }))
vi.mock('expo-device', () => ({ modelName: 'iPhone' }))
vi.mock('../../../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  readFiles: state.readFiles,
  waitForInitialScan: state.scan,
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    setState: vi.fn(),
    getState: () => ({
      iCloudSyncEnabled: state.enabled,
      iCloudDeviceId: 'device',
      set: vi.fn(),
    }),
  },
}))
vi.mock('@/features/supporter/stores/supporter', () => ({
  useSupporter: { getState: () => ({ isSupporter: true }) },
}))
vi.mock('@/stores/contactsStore', () => ({ default: {} }))
vi.mock('@/stores/conversationStore', () => ({ default: {} }))
vi.mock('@/stores/serviceReport', () => ({ default: {} }))
vi.mock('@/stores/categories', () => ({ default: {} }))
vi.mock('@/stores/mileage', () => ({ default: {} }))
vi.mock('@/stores/profile', () => ({ useProfile: {} }))
vi.mock('@/app/sync/payload', () => ({
  parsePayload: () => null,
  isNewerPayloadVersion: () => false,
}))
vi.mock('@/app/sync/merge', () => ({}))
vi.mock('@/app/sync/imageSync', () => ({}))
vi.mock('@/app/sync/imageSources', () => ({}))
vi.mock('@/lib/account', () => ({}))
vi.mock('@/lib/iCloudIdentity', () => ({
  checkICloudIdentity: () => true,
  ensureSyncDeviceId: () => 'device',
}))
vi.mock('@/lib/analytics', () => ({ analytics: {} }))
vi.mock('@/lib/normalizeDate', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
}))

import { pullAndMerge, pullBeforeCalendarPublish } from '@/app/sync/iCloudSync'

describe('data refresh before calendar publishing', () => {
  beforeEach(() => {
    state.enabled = true
    state.readFiles.mockReset()
    state.scan.mockResolvedValue(true)
  })

  it('accepts a successful empty read', async () => {
    state.readFiles.mockResolvedValue({ files: [] })
    await expect(pullBeforeCalendarPublish()).resolves.toBeUndefined()
  })

  it('does not trust an empty read before iCloud finishes its initial scan', async () => {
    state.scan.mockResolvedValueOnce(false)
    await expect(pullBeforeCalendarPublish()).rejects.toThrow('scan incomplete')
    expect(state.readFiles).not.toHaveBeenCalled()
  })

  it('does not publish while remote files are still downloading', async () => {
    state.readFiles.mockResolvedValue({
      files: [],
      pending: ['sync-other.json'],
    })
    await expect(pullBeforeCalendarPublish()).rejects.toThrow('fully read')
  })

  it('does not publish after skipping an unreadable remote payload', async () => {
    state.readFiles.mockResolvedValue({
      files: [{ filename: 'sync-other.json', json: '{broken', modifiedAt: 1 }],
    })
    await expect(pullBeforeCalendarPublish()).rejects.toThrow('fully read')
  })

  it('allows a fresh read after a skipped pull', async () => {
    state.enabled = false
    await expect(pullAndMerge('foreground')).resolves.toBe(false)
    state.enabled = true
    state.readFiles.mockResolvedValue({ files: [] })
    await expect(pullBeforeCalendarPublish()).resolves.toBeUndefined()
    expect(state.readFiles).toHaveBeenCalledTimes(1)
  })

  it('propagates read failures to calendar publishing while ordinary sync defers', async () => {
    state.readFiles.mockRejectedValue(new Error('offline'))
    await expect(pullBeforeCalendarPublish()).rejects.toThrow(
      'could not be fully read'
    )
    await expect(pullAndMerge('foreground')).resolves.toBe(false)
  })

  it('awaits the queued fresh read when joining an in-flight pull', async () => {
    let finishFirst!: () => void
    let finishSecond!: () => void
    state.readFiles
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = () => resolve({ files: [] })
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecond = () => resolve({ files: [] })
          })
      )
    const foreground = pullAndMerge('foreground')
    let ready = false
    const exporting = pullBeforeCalendarPublish().then(() => {
      ready = true
    })
    await vi.waitFor(() => expect(state.readFiles).toHaveBeenCalledTimes(1))
    finishFirst()
    await foreground
    await vi.waitFor(() => expect(state.readFiles).toHaveBeenCalledTimes(2))
    expect(ready).toBe(false)
    finishSecond()
    await exporting
    expect(ready).toBe(true)
  })

  it('stops if sync is disabled while waiting for a queued refresh', async () => {
    let finish!: () => void
    state.readFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ files: [] })
        })
    )
    const foreground = pullAndMerge('foreground')
    const exporting = pullBeforeCalendarPublish()
    const assertion = expect(exporting).rejects.toThrow('unavailable')
    await vi.waitFor(() => expect(state.readFiles).toHaveBeenCalledTimes(1))
    state.enabled = false
    finish()
    await foreground
    await assertion
  })
})
