import {
  requestPersistentStorage,
  type StorageStatus,
} from '@/lib/webStorage/persistence'
import { secureKv as defaultSecureKv } from '@/lib/webStorage/secureKv'
import type { StoreDatabase } from '@/lib/webStorage/storeDatabase'
import { claimTab } from '@/lib/webStorage/tabLock'
import { webStores } from '@/lib/webStorage/webStores'

/** Set by "Use Here" in this tab, read by the reload it triggers. */
const TAKE_OVER_KEY = 'witnesswork-take-over'

type Environment = {
  stores: StoreDatabase
  secureKv: Pick<typeof defaultSecureKv, 'clearAll' | 'available'>
  locks: LockManager | undefined
  storage: StorageManager | undefined
  session: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined
  reload: () => void
  /** `document` and `window` events. */
  on: (
    target: 'document' | 'window',
    event: string,
    listener: () => void
  ) => void
  isHidden: () => boolean
  lockName?: string
}

export type WebStorageLaunch = {
  /** This tab works with the data; otherwise it shows "in another tab". */
  activeTab: boolean
  /** It became the active tab through Use Here. */
  tookOver: boolean
}

export function createWebStorageBoot(env: Environment) {
  let status: Promise<StorageStatus | undefined> = Promise.resolve(undefined)
  let launch: WebStorageLaunch | undefined

  const session = <T>(
    action: (s: NonNullable<Environment['session']>) => T
  ) => {
    try {
      return env.session ? action(env.session) : undefined
    } catch {
      return undefined
    }
  }

  // A page in the back/forward cache still gets these events; reloading it
  // then would reload whatever page the tab shows now. It reloads once it's
  // shown again instead.
  let away = false
  let reloadWhenShown = false
  const reload = () => {
    if (away) reloadWhenShown = true
    else env.reload()
  }
  env.on('window', 'pagehide', () => (away = true))
  env.on('window', 'pageshow', () => {
    away = false
    if (reloadWhenShown) env.reload()
  })

  /** Another tab took over: save what's on its way, then show "in use". */
  async function standDown() {
    await env.stores.stopWriting()
    // After the lock lets the other tab read what was just saved.
    setTimeout(reload)
  }

  /**
   * Runs before the app's first render. The active tab loads the stores from
   * IndexedDB and writes back to it; another tab loads them read-only, only to
   * draw "WitnessWork is open in another tab" in the User's language.
   */
  async function prepare(): Promise<WebStorageLaunch> {
    const takeOver = session((s) => s.getItem(TAKE_OVER_KEY)) === '1'
    session((s) => s.removeItem(TAKE_OVER_KEY))
    // Claim first: after a takeover, the read below then sees every write the
    // other tab made before it stood down.
    const activeTab = await claimTab({
      locks: env.locks,
      name: env.lockName,
      takeOver,
      onTakenOver: standDown,
    })
    await env.stores.hydrate()
    // A newer version of the app needs the database; it runs after a reload.
    env.stores.onVersionChange(reload)
    launch = { activeTab, tookOver: takeOver && activeTab }
    if (!activeTab) {
      await env.stores.stopWriting()
      return launch
    }
    // Writes go out as they happen; these retry any that failed before the
    // page is hidden or closed.
    const flush = () => void env.stores.flush()
    env.on('document', 'visibilitychange', () => env.isHidden() && flush())
    env.on('window', 'pagehide', flush)
    status = requestPersistentStorage(env.storage)
    return launch
  }

  return {
    prepare,
    /** "Use Here": reload as the active tab, making the other one stand down. */
    takeOverHere() {
      const marked = session((s) => {
        s.setItem(TAKE_OVER_KEY, '1')
        return true
      })
      if (marked) return env.reload()
      // No session storage: take the lock here, then reload into it.
      void claimTab({
        locks: env.locks,
        name: env.lockName,
        takeOver: true,
        onTakenOver: () => {},
      }).then(env.reload)
    },
    /**
     * Deletes every bit of WitnessWork's local data in this browser: the stores
     * and the secure key/value store. Writes stop until the caller reloads the
     * page, which it must do next.
     */
    async clearAllWebData() {
      await Promise.all([
        env.stores.wipe(),
        env.secureKv.available ? env.secureKv.clearAll() : undefined,
      ])
    },
    /** Whether the data is persistent, and how much space it uses. */
    storageStatus: () => status,
    /** What `prepare` decided, once it ran. */
    launch: () => launch,
    stores: env.stores,
  }
}

const browser = typeof window !== 'undefined' && typeof document !== 'undefined'

const sessionStorageOrUndefined = () => {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

/** The page's boot, wired to the browser. */
export const webStorageBoot = createWebStorageBoot({
  stores: webStores,
  secureKv: defaultSecureKv,
  locks: browser ? navigator.locks : undefined,
  storage: browser ? navigator.storage : undefined,
  session: browser ? sessionStorageOrUndefined() : undefined,
  reload: () => window.location.reload(),
  on: (target, event, listener) => {
    if (!browser) return
    ;(target === 'document' ? document : window).addEventListener(
      event,
      listener
    )
  },
  isHidden: () => document.visibilityState === 'hidden',
})

/**
 * Deletes all of WitnessWork's local data in this browser (stores and secure
 * key/value store). Reload the page straight after; see docs/web-storage.md.
 */
export const clearAllWebData = () => webStorageBoot.clearAllWebData()
