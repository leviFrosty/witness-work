import {
  requestPersistentStorage,
  type StorageStatus,
} from '@/lib/webStorage/persistence'
import { secureKv as defaultSecureKv } from '@/lib/webStorage/secureKv'
import type { StoreDatabase } from '@/lib/webStorage/storeDatabase'
import { claimTab } from '@/lib/webStorage/tabLock'
import { webStores } from '@/lib/webStorage/webStores'

const TAKE_OVER_KEY = 'witnesswork-take-over'

export const WIPE_PENDING_KEY = 'wipe-pending'

export const DATA_OWNER_KEY = 'data-owner'

export const SIGNED_OUT_DATA = ''

type Environment = {
  stores: StoreDatabase
  secureKv: Pick<
    typeof defaultSecureKv,
    'clearAll' | 'available' | 'get' | 'set'
  >
  locks: LockManager | undefined
  storage: StorageManager | undefined
  session: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined
  reload: () => void

  on: (
    target: 'document' | 'window',
    event: string,
    listener: () => void
  ) => void
  isHidden: () => boolean
  lockName?: string
}

export type WebStorageLaunch = {
  activeTab: boolean

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

  async function standDown() {
    await env.stores.stopWriting()

    setTimeout(reload)
  }

  async function clearAllWebData() {
    await env.stores.wipe()
    if (env.secureKv.available) await env.secureKv.clearAll()
  }

  async function finishPendingWipe(): Promise<boolean> {
    if (!env.secureKv.available) return false
    try {
      if ((await env.secureKv.get(WIPE_PENDING_KEY)) !== true) return false
      await clearAllWebData()
    } catch {
      return false
    }
    reload()
    return true
  }

  async function noteSignedOutData() {
    if (!env.secureKv.available || env.stores.hasEntries()) return
    try {
      if ((await env.secureKv.get(DATA_OWNER_KEY)) === undefined)
        await env.secureKv.set(DATA_OWNER_KEY, SIGNED_OUT_DATA)
    } catch {}
  }

  async function prepare(): Promise<WebStorageLaunch> {
    const takeOver = session((s) => s.getItem(TAKE_OVER_KEY)) === '1'
    session((s) => s.removeItem(TAKE_OVER_KEY))

    const activeTab = await claimTab({
      locks: env.locks,
      name: env.lockName,
      takeOver,
      onTakenOver: standDown,
    })
    await env.stores.hydrate()

    env.stores.onVersionChange(reload)
    launch = { activeTab, tookOver: takeOver && activeTab }
    if (!activeTab) {
      await env.stores.stopWriting()
      return launch
    }

    if (await finishPendingWipe()) return new Promise<never>(() => {})
    await noteSignedOutData()

    const flush = () => void env.stores.flush()
    env.on('document', 'visibilitychange', () => env.isHidden() && flush())
    env.on('window', 'pagehide', flush)
    status = requestPersistentStorage(env.storage)
    return launch
  }

  return {
    prepare,

    takeOverHere() {
      const marked = session((s) => {
        s.setItem(TAKE_OVER_KEY, '1')
        return true
      })
      if (marked) return env.reload()

      void claimTab({
        locks: env.locks,
        name: env.lockName,
        takeOver: true,
        onTakenOver: () => {},
      }).then(env.reload)
    },

    clearAllWebData,

    markWipePending: async () => {
      if (env.secureKv.available) await env.secureKv.set(WIPE_PENDING_KEY, true)
    },

    hasLocalData: () => env.stores.hasEntries(),

    storageStatus: () => status,

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

export const clearAllWebData = () => webStorageBoot.clearAllWebData()

export const markWipePending = () => webStorageBoot.markWipePending()
