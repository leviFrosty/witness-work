import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({
  locked: false,
  values: new Map<string, string>(),
}))

vi.mock('@/stores/mmkv', () => ({
  isStorageLocked: () => storage.locked,
  mmkvStorage: { getString: (key: string) => storage.values.get(key) },
  PersistStorage: {},
}))

const saved = { state: { locale: 'ar' }, version: 0 }

beforeEach(() => {
  vi.resetModules()
  storage.locked = false
  storage.values.set('preferences', JSON.stringify(saved))
})

describe('readBootPreferences', () => {
  it('reads the saved preferences', async () => {
    const { readBootPreferences } = await import('./bootPreferences')
    expect(readBootPreferences()).toEqual(saved)
  })

  it('reads nothing before the first unlock', async () => {
    storage.locked = true
    const { readBootPreferences } = await import('./bootPreferences')
    expect(readBootPreferences()).toBeNull()
  })
})
