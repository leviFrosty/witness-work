import { describe, expect, it, vi, beforeEach } from 'vitest'

const setItem = vi.fn<(k: string, v: string) => Promise<void>>()
const getItem = vi.fn<(k: string) => Promise<string | null>>()
const removeItem = vi.fn<(k: string) => Promise<void>>()
const addBreadcrumb = vi.fn()
const captureException = vi.fn()
const mmkvSet = vi.fn<(k: string, v: string) => void>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: (k: string, v: string) => setItem(k, v),
    getItem: (k: string) => getItem(k),
    removeItem: (k: string) => removeItem(k),
    getAllKeys: () => Promise.resolve([]),
  },
}))

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    size = 1
    getBoolean() {
      return false
    }
    getString() {
      return undefined
    }
    set(k: string, v: string) {
      mmkvSet(k, v)
    }
    delete() {}
  },
}))

vi.mock('@/lib/errorTracking', () => ({
  errorTracking: {
    addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
    captureException: (...args: unknown[]) => captureException(...args),
  },
}))

import {
  GuardedAsyncStorage,
  MmkvStorage,
  isTransientStorageReadError,
} from '@/stores/mmkv'

describe('GuardedAsyncStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes through to AsyncStorage on success', async () => {
    setItem.mockResolvedValueOnce(undefined)
    await GuardedAsyncStorage.setItem('preferences', '{"a":1}')
    expect(setItem).toHaveBeenCalledWith('preferences', '{"a":1}')
    expect(addBreadcrumb).not.toHaveBeenCalled()
  })

  it('swallows transient write failures instead of throwing', async () => {
    setItem.mockRejectedValueOnce(
      new Error("You don't have permission to save the file 'manifest.json'")
    )

    await expect(
      GuardedAsyncStorage.setItem('preferences', '{"a":1}')
    ).resolves.toBeUndefined()

    expect(addBreadcrumb).toHaveBeenCalledTimes(1)
  })

  it('passes successful reads and removes straight through', async () => {
    getItem.mockResolvedValueOnce('value')
    removeItem.mockResolvedValueOnce(undefined)

    await expect(GuardedAsyncStorage.getItem('k')).resolves.toBe('value')
    await GuardedAsyncStorage.removeItem('k')

    expect(getItem).toHaveBeenCalledWith('k')
    expect(removeItem).toHaveBeenCalledWith('k')
    expect(addBreadcrumb).not.toHaveBeenCalled()
  })

  it('degrades transient read failures to a cache-miss (JW-TIME-C5)', async () => {
    getItem.mockRejectedValueOnce(
      new Error(
        'Failed to read storage file.Error Domain=NSCocoaErrorDomain Code=257 "The file “manifest.json” couldn’t be opened because you don’t have permission to view it."'
      )
    )

    await expect(GuardedAsyncStorage.getItem('k')).resolves.toBeNull()
    expect(addBreadcrumb).toHaveBeenCalledTimes(1)
  })

  it('rethrows non-transient read errors', async () => {
    getItem.mockRejectedValueOnce(new Error('boom'))
    await expect(GuardedAsyncStorage.getItem('k')).rejects.toThrow('boom')
  })
})

describe('MmkvStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports a failed write once an hour instead of throwing', () => {
    mmkvSet.mockImplementation(() => {
      throw new Error('Failed to set preferences!')
    })

    expect(() => MmkvStorage.setItem('preferences', '{"a":1}')).not.toThrow()
    expect(() => MmkvStorage.setItem('preferences', '{"a":2}')).not.toThrow()

    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException).toHaveBeenCalledWith(
      new Error('Failed to set preferences!'),
      { storageKey: 'preferences' }
    )
  })
})

describe('isTransientStorageReadError', () => {
  it('matches iOS file-protection / locked-device read failures', () => {
    expect(
      isTransientStorageReadError(new Error('Failed to read storage file'))
    ).toBe(true)
    expect(
      isTransientStorageReadError(new Error('NSCocoaErrorDomain Code=513'))
    ).toBe(true)
    expect(
      isTransientStorageReadError(new Error('Operation not permitted'))
    ).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(isTransientStorageReadError(new Error('boom'))).toBe(false)
    expect(isTransientStorageReadError(undefined)).toBe(false)
    expect(isTransientStorageReadError(null)).toBe(false)
  })
})
