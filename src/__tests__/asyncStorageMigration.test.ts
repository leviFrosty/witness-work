import { describe, expect, it, vi, beforeEach } from 'vitest'

// Exercises the real `@/stores/mmkv` migration against in-memory stand-ins for
// AsyncStorage and MMKV.

const asyncStore = new Map<string, string>()
const mmkvStore = new Map<string, string | boolean>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: () => Promise.resolve([...asyncStore.keys()]),
    getItem: (k: string) => Promise.resolve(asyncStore.get(k) ?? null),
    setItem: (k: string, v: string) => {
      asyncStore.set(k, v)
      return Promise.resolve()
    },
    removeItem: (k: string) => {
      asyncStore.delete(k)
      return Promise.resolve()
    },
  },
}))

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getBoolean(k: string) {
      const value = mmkvStore.get(k)
      return typeof value === 'boolean' ? value : undefined
    }
    getString(k: string) {
      const value = mmkvStore.get(k)
      return typeof value === 'string' ? value : undefined
    }
    contains(k: string) {
      return mmkvStore.has(k)
    }
    set(k: string, v: string | boolean) {
      mmkvStore.set(k, v)
    }
    delete(k: string) {
      mmkvStore.delete(k)
    }
  },
}))

vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { addBreadcrumb: vi.fn() },
}))

import {
  hasMigratedFromAsyncStorage,
  migrateFromAsyncStorage,
  PersistStorage,
} from '@/stores/mmkv'

describe('migrateFromAsyncStorage', () => {
  beforeEach(() => {
    asyncStore.clear()
    mmkvStore.clear()
  })

  it('skips the reload on a fresh install', async () => {
    await expect(migrateFromAsyncStorage()).resolves.toBe(false)
    expect(hasMigratedFromAsyncStorage()).toBe(true)
  })

  it('requests a reload after copying legacy data', async () => {
    asyncStore.set('preferences', '{"a":1}')
    asyncStore.set('flag', 'true')

    await expect(migrateFromAsyncStorage()).resolves.toBe(true)
    expect(mmkvStore.get('preferences')).toBe('{"a":1}')
    expect(mmkvStore.get('flag')).toBe(true)
    expect(hasMigratedFromAsyncStorage()).toBe(true)
  })
})

describe('PersistStorage', () => {
  beforeEach(() => {
    asyncStore.clear()
    mmkvStore.clear()
  })

  it('switches from AsyncStorage to MMKV once the migration completes', async () => {
    await PersistStorage.setItem('preferences', 'before')
    expect(asyncStore.get('preferences')).toBe('before')

    mmkvStore.set('hasMigratedFromAsyncStorage', true)
    await PersistStorage.setItem('preferences', 'after')

    expect(mmkvStore.get('preferences')).toBe('after')
    expect(asyncStore.get('preferences')).toBe('before')
  })
})
