import { describe, expect, it } from 'vitest'
import {
  createGuestLinkStore,
  freshGuestLink,
  GUEST_CURRENT_KEY,
  GUEST_STORE_PREFIX,
  type GuestStorage,
} from '@/features/territories/guest/store'

function memoryStorage(): GuestStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('guest link store', () => {
  it('saves, loads, and removes a link with its current pointer', () => {
    const storage = memoryStorage()
    const store = createGuestLinkStore(storage)
    const link = { ...freshGuestLink('S', 'L', 'secret'), name: 'Maria' }
    store.save(link)
    store.setCurrent('L')
    expect(store.load('L')).toEqual(link)
    expect(store.current()).toBe('L')
    store.remove('L')
    expect(store.load('L')).toBeNull()
    expect(storage.map.has(GUEST_CURRENT_KEY)).toBe(false)
  })

  it('ignores damaged entries', () => {
    const storage = memoryStorage()
    storage.setItem(`${GUEST_STORE_PREFIX}L`, '{nope')
    expect(createGuestLinkStore(storage).load('L')).toBeNull()
    storage.setItem(`${GUEST_STORE_PREFIX}L`, JSON.stringify({ v: 2 }))
    expect(createGuestLinkStore(storage).load('L')).toBeNull()
  })

  it('sweeps links past their end, keeping the open one', () => {
    const storage = memoryStorage()
    const store = createGuestLinkStore(storage)
    store.save({ ...freshGuestLink('S', 'old', 'x'), expiresAt: 10 })
    store.save({ ...freshGuestLink('S', 'live', 'x'), expiresAt: 100 })
    store.save({ ...freshGuestLink('S', 'open', 'x'), expiresAt: 10 })
    store.setCurrent('open')
    store.sweep(50, 'open')
    expect(store.load('old')).toBeNull()
    expect(store.load('live')).not.toBeNull()
    expect(store.load('open')).not.toBeNull()
  })

  it('works without storage, or when it throws', () => {
    const none = createGuestLinkStore(null)
    expect(none.save(freshGuestLink('S', 'L', 'x'))).toBe(false)
    const throwing = createGuestLinkStore({
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(throwing.save(freshGuestLink('S', 'L', 'x'))).toBe(false)
  })
})
