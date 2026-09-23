import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ enabled: true, readAll: vi.fn() }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: {} }))
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: '' }))
vi.mock('expo-device', () => ({ modelName: 'iPhone' }))
vi.mock('../../../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  readAll: state.readAll,
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
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
vi.mock('@/stores/profile', () => ({ useProfile: {} }))
vi.mock('@/app/sync/payload', () => ({}))
vi.mock('@/app/sync/merge', () => ({}))
vi.mock('@/app/sync/imageSync', () => ({}))
vi.mock('@/app/sync/imageSources', () => ({}))
vi.mock('@/lib/account', () => ({}))
vi.mock('@/lib/analytics', () => ({ analytics: {} }))
vi.mock('@/lib/normalizeDate', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), addBreadcrumb: vi.fn() },
}))

import { pullAndMerge, pullBeforeCalendarPublish } from '@/app/sync/iCloudSync'

describe('data refresh before calendar publishing', () => {
  beforeEach(() => {
    state.enabled = true
    state.readAll.mockReset()
  })

  it('accepts a successful empty read', async () => {
    state.readAll.mockResolvedValue([])
    await expect(pullBeforeCalendarPublish()).resolves.toBeUndefined()
  })

  it('allows a fresh read after a skipped pull', async () => {
    state.enabled = false
    await expect(pullAndMerge('foreground')).resolves.toBe(false)
    state.enabled = true
    state.readAll.mockResolvedValue([])
    await expect(pullBeforeCalendarPublish()).resolves.toBeUndefined()
    expect(state.readAll).toHaveBeenCalledTimes(1)
  })

  it('propagates read failures to calendar publishing while ordinary sync defers', async () => {
    state.readAll.mockRejectedValue(new Error('offline'))
    await expect(pullBeforeCalendarPublish()).rejects.toThrow(
      'could not be read'
    )
    await expect(pullAndMerge('foreground')).resolves.toBe(false)
  })

  it('awaits the queued fresh read when joining an in-flight pull', async () => {
    let finishFirst!: () => void
    let finishSecond!: () => void
    state.readAll
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = () => resolve([])
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecond = () => resolve([])
          })
      )
    const foreground = pullAndMerge('foreground')
    let ready = false
    const exporting = pullBeforeCalendarPublish().then(() => {
      ready = true
    })
    await vi.waitFor(() => expect(state.readAll).toHaveBeenCalledTimes(1))
    finishFirst()
    await foreground
    await vi.waitFor(() => expect(state.readAll).toHaveBeenCalledTimes(2))
    expect(ready).toBe(false)
    finishSecond()
    await exporting
    expect(ready).toBe(true)
  })

  it('stops if sync is disabled while waiting for a queued refresh', async () => {
    let finish!: () => void
    state.readAll.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve([])
        })
    )
    const foreground = pullAndMerge('foreground')
    const exporting = pullBeforeCalendarPublish()
    const assertion = expect(exporting).rejects.toThrow('unavailable')
    await vi.waitFor(() => expect(state.readAll).toHaveBeenCalledTimes(1))
    state.enabled = false
    finish()
    await foreground
    await assertion
  })
})
