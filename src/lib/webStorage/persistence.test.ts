import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from '@/lib/webStorage/persistence'

const manager = (overrides: Partial<StorageManager> = {}) =>
  ({
    persisted: vi.fn(async () => false),
    persist: vi.fn(async () => true),
    estimate: vi.fn(async () => ({ usage: 10, quota: 100 })),
    ...overrides,
  }) as unknown as StorageManager

describe('requestPersistentStorage', () => {
  it('asks once when storage isn’t persistent yet, and reads the estimate', async () => {
    const storage = manager()
    expect(await requestPersistentStorage(storage)).toEqual({
      persisted: true,
      usage: 10,
      quota: 100,
    })
    expect(storage.persist).toHaveBeenCalledTimes(1)
  })

  it('doesn’t ask again once storage is persistent', async () => {
    const storage = manager({ persisted: vi.fn(async () => true) })
    await requestPersistentStorage(storage)
    expect(storage.persist).not.toHaveBeenCalled()
  })

  it('carries on when the browser has no Storage API or refuses', async () => {
    expect(await requestPersistentStorage(undefined)).toBeUndefined()
    const storage = manager({
      persist: vi.fn(async () => {
        throw new Error('denied')
      }),
    })
    expect(await requestPersistentStorage(storage)).toEqual({
      persisted: false,
      usage: 10,
      quota: 100,
    })
  })
})
