import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = vi.hoisted(() => ({
  open: true,
  data: new Map<string, string | boolean>(),
  trims: 0,
  sets: [] as string[],
  asyncSets: [] as string[],
}))

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    get size() {
      return disk.open ? disk.data.size : 0
    }
    getBoolean(key: string) {
      const value = disk.open ? disk.data.get(key) : undefined
      return typeof value === 'boolean' ? value : undefined
    }
    getString(key: string) {
      const value = disk.open ? disk.data.get(key) : undefined
      return typeof value === 'string' ? value : undefined
    }
    set(key: string, value: string | boolean) {
      if (!disk.open) throw new Error(`Failed to set ${key}!`)
      disk.sets.push(key)
      disk.data.set(key, value)
    }
    delete(key: string) {
      if (disk.open) disk.data.delete(key)
    }
    trim() {
      disk.trims += 1
    }
  },
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: async (key: string) => {
      disk.asyncSets.push(key)
    },
    getItem: async () => '{"state":{"legacy":true}}',
    removeItem: async () => {},
    getAllKeys: async () => [],
  },
}))

vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { addBreadcrumb: vi.fn(), captureException: vi.fn() },
}))

const USER_DATA = '{"state":{"onboardingComplete":true}}'

async function launch() {
  vi.resetModules()
  disk.sets = []
  disk.asyncSets = []
  return import('@/stores/mmkv')
}

beforeEach(() => {
  disk.open = true
  disk.data = new Map()
  disk.trims = 0
})

describe('a launch before the first unlock', () => {
  beforeEach(() => {
    disk.data.set('hasMigratedFromAsyncStorage', true)
    disk.data.set('preferences', USER_DATA)
    disk.open = false
  })

  it('reads and writes nothing through the persist adapters', async () => {
    const storage = await launch()
    expect(storage.isStorageLocked()).toBe(true)

    expect(storage.MmkvStorage.getItem('preferences')).toBeNull()
    expect(await storage.PersistStorage.getItem('preferences')).toBeNull()
    expect(() =>
      storage.MmkvStorage.setItem('preferences', '{"state":{}}')
    ).not.toThrow()
    await storage.PersistStorage.setItem('preferences', '{"state":{}}')
    await storage.PersistStorage.removeItem('preferences')
    expect(disk.asyncSets).toEqual([])
  })

  it('keeps defaults from overwriting the data once the device unlocks', async () => {
    const storage = await launch()
    disk.open = true

    storage.MmkvStorage.setItem('preferences', '{"state":{}}')
    await storage.PersistStorage.setItem('preferences', '{"state":{}}')
    storage.MmkvStorage.removeItem('preferences')

    expect(disk.data.get('preferences')).toBe(USER_DATA)
  })

  it('reopens storage after the unlock, still blocking writes until the reload', async () => {
    const storage = await launch()
    expect(storage.reopenLockedStorage()).toBe(false)

    disk.open = true
    expect(storage.reopenLockedStorage()).toBe(true)
    expect(disk.trims).toBe(2)
    expect(storage.isStorageLocked()).toBe(true)
    storage.MmkvStorage.setItem('preferences', '{"state":{}}')
    expect(disk.data.get('preferences')).toBe(USER_DATA)

    const reloaded = await launch()
    expect(reloaded.isStorageLocked()).toBe(false)
    expect(reloaded.MmkvStorage.getItem('preferences')).toBe(USER_DATA)
    expect(disk.sets).toEqual([])
  })

  it('carries on as before once released', async () => {
    const storage = await launch()
    disk.open = true
    storage.releaseStorageLock()
    storage.MmkvStorage.setItem('preferences', '{"state":{"a":1}}')
    expect(disk.data.get('preferences')).toBe('{"state":{"a":1}}')
  })
})

describe('an unlocked launch', () => {
  it('reads saved data without writing', async () => {
    disk.data.set('preferences', USER_DATA)
    const storage = await launch()
    expect(storage.isStorageLocked()).toBe(false)
    expect(storage.MmkvStorage.getItem('preferences')).toBe(USER_DATA)
    expect(disk.sets).toEqual([])
  })

  it('is not locked on a fresh install', async () => {
    const storage = await launch()
    expect(storage.isStorageLocked()).toBe(false)
    storage.MmkvStorage.setItem('preferences', USER_DATA)
    expect(disk.data.get('preferences')).toBe(USER_DATA)
  })
})
