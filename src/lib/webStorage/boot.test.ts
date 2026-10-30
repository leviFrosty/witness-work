import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createWebStorageBoot } from '@/lib/webStorage/boot'
import { createSecureKv } from '@/lib/webStorage/secureKv'
import { createStoreDatabase } from '@/lib/webStorage/storeDatabase'

let n = 0

/** Tabs of one browser profile: one IndexedDB, one lock manager. */
function browserProfile() {
  const indexedDB = new IDBFactory()
  const lockName = `boot-test-${n++}`
  return {
    indexedDB,
    /** A page load; `session` carries over a reload of the same tab. */
    tab(session = new Map<string, string>()) {
      const stores = createStoreDatabase({ indexedDB })
      const secureKv = createSecureKv({ indexedDB })
      const listeners = new Map<string, (() => void)[]>()
      const emit = (event: string) =>
        listeners.get(event)?.forEach((listener) => listener())
      const reload = vi.fn()
      const boot = createWebStorageBoot({
        stores,
        secureKv,
        locks: navigator.locks,
        storage: undefined,
        session: {
          getItem: (k) => session.get(k) ?? null,
          setItem: (k, v) => void session.set(k, v),
          removeItem: (k) => void session.delete(k),
        },
        reload,
        on: (_, event, listener) =>
          listeners.set(event, [...(listeners.get(event) ?? []), listener]),
        isHidden: () => true,
        lockName,
      })
      return { stores, secureKv, boot, reload, emit, session }
    },
  }
}

describe('web storage boot', () => {
  it('makes one tab active and loads a second read-only', async () => {
    const profile = browserProfile()
    const first = profile.tab()
    expect(await first.boot.prepare()).toEqual({
      activeTab: true,
      tookOver: false,
    })
    first.stores.set('mmkv.default', 'contacts', 'saved')
    await first.stores.flush()

    const second = profile.tab()
    expect(await second.boot.prepare()).toEqual({
      activeTab: false,
      tookOver: false,
    })
    expect(second.stores.get('mmkv.default', 'contacts')).toBe('saved')
    second.stores.set('mmkv.default', 'contacts', 'from the second tab')
    await second.stores.flush()

    const third = createStoreDatabase({ indexedDB: profile.indexedDB })
    await third.hydrate()
    expect(third.get('mmkv.default', 'contacts')).toBe('saved')
  })

  it('takes over with Use Here, after the first tab’s last edit is saved', async () => {
    const profile = browserProfile()
    const first = profile.tab()
    await first.boot.prepare()
    const second = profile.tab()
    await second.boot.prepare()

    // Use Here marks the tab and reloads it into a fresh page.
    second.boot.takeOverHere()
    expect(second.reload).toHaveBeenCalledTimes(1)
    const reloaded = profile.tab(second.session)

    first.stores.set('mmkv.default', 'contacts', 'last edit in the first tab')
    expect(await reloaded.boot.prepare()).toEqual({
      activeTab: true,
      tookOver: true,
    })
    expect(reloaded.stores.get('mmkv.default', 'contacts')).toBe(
      'last edit in the first tab'
    )
    await vi.waitFor(() => expect(first.reload).toHaveBeenCalledTimes(1))
    expect(first.stores.mode()).toBe('stopped')
    // The marker is used up: the next reload doesn't take over again.
    expect(reloaded.session.size).toBe(0)
  })

  it('retries failed writes when the page is hidden or closed', async () => {
    const tab = browserProfile().tab()
    await tab.boot.prepare()
    const flush = vi.spyOn(tab.stores, 'flush')
    tab.emit('visibilitychange')
    tab.emit('pagehide')
    expect(flush).toHaveBeenCalledTimes(2)
  })

  it('reloads when a newer version needs the database', async () => {
    const profile = browserProfile()
    const tab = profile.tab()
    await tab.boot.prepare()
    await new Promise<void>((resolve) => {
      const request = profile.indexedDB.open('witnesswork-stores', 2)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })
    expect(tab.reload).toHaveBeenCalledTimes(1)
  })

  it('waits to reload a page in the back/forward cache until it’s shown', async () => {
    const profile = browserProfile()
    const tab = profile.tab()
    await tab.boot.prepare()
    tab.emit('pagehide')
    await new Promise<void>((resolve) => {
      const request = profile.indexedDB.open('witnesswork-stores', 2)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })
    expect(tab.reload).not.toHaveBeenCalled()
    tab.emit('pageshow')
    expect(tab.reload).toHaveBeenCalledTimes(1)
  })

  it('wipes the stores and the secure key/value store', async () => {
    const profile = browserProfile()
    const tab = profile.tab()
    await tab.boot.prepare()
    tab.stores.set('mmkv.default', 'contacts', 'x')
    await tab.secureKv.set('session', { id: 1 })
    await tab.boot.clearAllWebData()

    const fresh = createStoreDatabase({ indexedDB: profile.indexedDB })
    await fresh.hydrate()
    expect(fresh.keys('mmkv.default')).toEqual([])
    expect(await tab.secureKv.get('session')).toBeUndefined()
  })
})
