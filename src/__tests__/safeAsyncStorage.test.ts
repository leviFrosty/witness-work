import { describe, it, expect, vi, beforeEach } from 'vitest'

// `src/stores/mmkv` instantiates `new MMKV()` at import time, which needs a
// React Native runtime. Stub it so we can exercise the SafeAsyncStorage
// wrapper in isolation.
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

const setItem = vi.fn<(name: string, value: string) => Promise<void>>()
const getItem = vi.fn<(name: string) => Promise<string | null>>()
const removeItem = vi.fn<(name: string) => Promise<void>>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: (name: string, value: string) => setItem(name, value),
    getItem: (name: string) => getItem(name),
    removeItem: (name: string) => removeItem(name),
    getAllKeys: () => Promise.resolve([]),
  },
}))

import { SafeAsyncStorage } from '@/stores/mmkv'

const code513 =
  'Failed to write value.Error Domain=NSCocoaErrorDomain Code=513 ' +
  '"You don’t have permission to save the file “abc” in the ' +
  'folder “RCTAsyncLocalStorage_V1”." UserInfo={...}'

describe('SafeAsyncStorage.setItem', () => {
  beforeEach(() => {
    setItem.mockReset()
    getItem.mockReset()
    removeItem.mockReset()
  })

  it('swallows the transient iOS Code=513 permission error', async () => {
    setItem.mockRejectedValueOnce(new Error(code513))
    await expect(SafeAsyncStorage.setItem('k', 'v')).resolves.toBeUndefined()
    expect(setItem).toHaveBeenCalledWith('k', 'v')
  })

  it('swallows a bare POSIX "Operation not permitted" failure', async () => {
    setItem.mockRejectedValueOnce(new Error('Operation not permitted'))
    await expect(SafeAsyncStorage.setItem('k', 'v')).resolves.toBeUndefined()
  })

  it('rethrows unexpected write errors', async () => {
    setItem.mockRejectedValueOnce(new Error('disk full: ENOSPC'))
    await expect(SafeAsyncStorage.setItem('k', 'v')).rejects.toThrow('ENOSPC')
  })

  it('passes successful writes through', async () => {
    setItem.mockResolvedValueOnce(undefined)
    await expect(SafeAsyncStorage.setItem('k', 'v')).resolves.toBeUndefined()
    expect(setItem).toHaveBeenCalledWith('k', 'v')
  })

  it('delegates reads and removals unchanged', async () => {
    getItem.mockResolvedValueOnce('value')
    removeItem.mockResolvedValueOnce(undefined)
    await expect(SafeAsyncStorage.getItem('k')).resolves.toBe('value')
    await SafeAsyncStorage.removeItem('k')
    expect(removeItem).toHaveBeenCalledWith('k')
  })
})
