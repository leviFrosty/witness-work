import { describe, expect, it, vi, beforeEach } from 'vitest'

// Use the real `@/stores/mmkv` module here (not the test mock) so we exercise
// the actual GuardedAsyncStorage adapter. `react-native-mmkv` and
// `@sentry/react-native` are stubbed because they require a native runtime.

const setItem = vi.fn<(k: string, v: string) => Promise<void>>()
const getItem = vi.fn<(k: string) => Promise<string | null>>()
const removeItem = vi.fn<(k: string) => Promise<void>>()
const addBreadcrumb = vi.fn()

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
    getBoolean() {
      return false
    }
    getString() {
      return undefined
    }
    set() {}
    delete() {}
  },
}))

vi.mock('@sentry/react-native', () => ({
  addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
}))

import { GuardedAsyncStorage } from '@/stores/mmkv'

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
    // Simulate the iOS NSCocoaErrorDomain 513 (device locked) rejection.
    setItem.mockRejectedValueOnce(
      new Error("You don't have permission to save the file 'manifest.json'")
    )

    await expect(
      GuardedAsyncStorage.setItem('preferences', '{"a":1}')
    ).resolves.toBeUndefined()

    expect(addBreadcrumb).toHaveBeenCalledTimes(1)
  })

  it('passes reads and removes straight through', async () => {
    getItem.mockResolvedValueOnce('value')
    removeItem.mockResolvedValueOnce(undefined)

    await expect(GuardedAsyncStorage.getItem('k')).resolves.toBe('value')
    await GuardedAsyncStorage.removeItem('k')

    expect(getItem).toHaveBeenCalledWith('k')
    expect(removeItem).toHaveBeenCalledWith('k')
  })
})
