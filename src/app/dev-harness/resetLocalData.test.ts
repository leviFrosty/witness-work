import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => {
  vi.stubGlobal('__DEV__', false)
  return {
    cleared: [] as string[],
    /** The default MMKV instance: what the stores saved. */
    saved: new Map<string, string>(),
    stopwatchReset: vi.fn(async () => undefined),
  }
})

vi.mock('@/stores/mmkv', async () => {
  const storage = {
    getItem: (key: string) => native.saved.get(key) ?? null,
    setItem: (key: string, value: string) => void native.saved.set(key, value),
    removeItem: (key: string) => void native.saved.delete(key),
  }
  return {
    ...(await import('@/__tests__/mocks/mmkv')),
    MmkvStorage: storage,
    PersistStorage: storage,
    clearMmkvStorage: () => {
      native.cleared.push('default')
      native.saved.clear()
    },
  }
})
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { clear: async () => undefined },
}))
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    id: string
    constructor({ id }: { id: string }) {
      this.id = id
    }
    clearAll() {
      native.cleared.push(this.id)
    }
  },
}))
vi.mock('../../../modules/stopwatch-bridge', () => ({
  reset: native.stopwatchReset,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_, name) => String(name), has: () => true })
)
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/features/contacts/lib/linking', () => ({ navigationRef: {} }))
vi.mock('@/features/map/lib/geocodeContacts', () => ({
  contactsToFind: () => [],
  pinLookupKey: () => '',
}))

import { RESET_STORES, resetLocalData } from '@/app/dev-harness/resetLocalData'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { initialBuddiesState } from '@/features/buddies/lib/state'
import useCategories from '@/stores/categories'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'

/** Persisted stores a reset clears through their own actions, not RESET_STORES. */
const RESET_BY_ACTIONS = [
  'contacts',
  'conversations',
  'serviceReports',
  'mileage',
  'petCompanion',
  'preferences',
  'profile',
]

/** MMKV instances a reset clears, besides the default one. */
const CLEARED_MMKV = [
  'notes-import-ledger',
  'pet-secrets',
  // Android binaries without the native stopwatch; `Stopwatch.reset()`.
  'stopwatch',
]

/**
 * MMKV instances a reset keeps. Each belongs to the install or to the account
 * key in the Keychain, which a reinstall on iOS keeps too; none is the User's
 * ministry data.
 */
const KEPT_MMKV: Record<string, string> = {
  'install-id': 'the install id',
  account: "the adopted account id (another device's claim)",
  'server-account':
    "the account's session, backup state and RevenueCat link, which follow the account key",
  'app-attest': 'App Attest key ids, registered with the server',
  'app-attest-lifecycle-v2': 'App Attest key ids, registered with the server',
  'notes-import-credits':
    "Notes Import's cached Import Credits; Scribe AI's launch cleanup empties it",
  'app-store-ratings': 'cached App Store totals for the paywall',
  'help-center': "the website's Help Center manifest, never the User's",
  'analytics-frequency': 'analytics throttling, never shown',
  'web-checkout':
    "web only: an open checkout's tier and start time, for its return page",
}

/** Every zustand `persist` store name and MMKV instance id in the app. */
function scanStorage() {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory())
        return ['__tests__', 'ios', 'android'].includes(entry.name)
          ? []
          : walk(path)
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [path]
        : []
    })
  const persisted: string[] = []
  const mmkv: string[] = []
  for (const file of [...walk('src'), ...walk('modules')]) {
    const source = readFileSync(file, 'utf8')
    if (/from 'zustand\/middleware'/.test(source)) {
      const calls = source.match(/\bpersist[<(]/g)?.length ?? 0
      const names = [
        ...source.matchAll(/\bname: '([\w-]+)',[^{}]*?\bstorage:/g),
      ].map((match) => match[1])
      // A store this scan can't name would slip past the checks below.
      expect(names, file).toHaveLength(calls)
      persisted.push(...names)
    }
    for (const match of source.matchAll(/new MMKV\(\{\s*id: '([^']+)'/g))
      mmkv.push(match[1])
  }
  return { persisted, mmkv: [...new Set(mmkv)] }
}

const persistName = (store: unknown) =>
  (
    store as { persist?: { getOptions: () => { name?: string } } }
  ).persist?.getOptions().name

describe('resetLocalData', () => {
  beforeEach(() => {
    native.cleared.length = 0
    native.saved.clear()
    vi.clearAllMocks()
  })

  it('resets every persisted store and MMKV instance, or keeps it for a reason', () => {
    const { persisted, mmkv } = scanStorage()
    const reset = [
      ...RESET_STORES.map(persistName).filter(Boolean),
      ...RESET_BY_ACTIONS,
    ]
    expect([...persisted].sort()).toEqual([...reset].sort())
    expect([...mmkv].sort()).toEqual(
      [...CLEARED_MMKV, ...Object.keys(KEPT_MMKV)].sort()
    )
  })

  it("forgets another run's buddies and Buddies switches", () => {
    useBuddies.setState({
      buddies: [{ inboxId: 'inbox-1' } as never],
      registeredInboxId: 'inbox-me',
      devOverride: true,
      flagLastKnown: true,
    })
    resetLocalData()
    expect(useBuddies.getState()).toEqual(initialBuddiesState)
  })

  it('puts every device store back to its initial state, in memory', () => {
    for (const store of RESET_STORES)
      store.setState({ leftover: true } as never, true)
    resetLocalData()
    // Categories get the builtin LDC Category back; see below.
    for (const store of RESET_STORES.filter((s) => s !== useCategories))
      expect((store as unknown as { getState: () => unknown }).getState()).toBe(
        store.getInitialState()
      )
  })

  it('keeps the builtin LDC Category, as a fresh launch seeds it', () => {
    useCategories.setState({
      categories: [{ id: 'other-run', name: 'Other run' } as never],
    })
    resetLocalData()
    expect(useCategories.getState().categories.map((c) => c.id)).toEqual([
      LDC_BUILTIN_CATEGORY_ID,
    ])
  })

  it('saves the reset state, so it is still there after a relaunch', () => {
    native.saved.set('leftover', 'from another run')
    resetLocalData()
    expect(native.saved.has('leftover')).toBe(false)
    const saved = (key: string) => JSON.parse(native.saved.get(key)!).state
    expect(
      saved('categories').categories.map((c: { id: string }) => c.id)
    ).toEqual([LDC_BUILTIN_CATEGORY_ID])
    expect(saved('preferences')).toMatchObject({
      onboardingComplete: false,
      hasMigratedTagsToCategories: true,
      hasCollapsedLdcIntoCategory: true,
    })
    expect(saved('buddies')).toMatchObject({ buddies: [] })
  })

  it('clears the Notes Import ledger, pet secrets and the stopwatch', () => {
    resetLocalData()
    expect(native.cleared).toEqual(
      expect.arrayContaining(['default', 'notes-import-ledger', 'pet-secrets'])
    )
    expect(native.stopwatchReset).toHaveBeenCalled()
  })

  it('forgets Scribe AI conversations, undo records and memory', async () => {
    const { useScribeConversations } = await import(
      '@/features/scribe/stores/conversations'
    )
    const { useScribeLedger } = await import('@/features/scribe/stores/ledger')
    const { useScribeMemory } = await import('@/features/scribe/stores/memory')
    useScribeMemory.setState({ enabled: false, text: 'A note' })
    useScribeConversations.setState({
      conversations: { c1: { id: 'c1' } as never },
      hasFinishedTurn: true,
    })
    useScribeLedger.setState({ records: { p1: { proposalId: 'p1' } as never } })
    resetLocalData()
    expect(useScribeConversations.getState()).toMatchObject({
      conversations: {},
      hasFinishedTurn: false,
    })
    expect(useScribeLedger.getState().records).toEqual({})
    expect(useScribeMemory.getState()).toMatchObject({
      enabled: true,
      text: '',
    })
  })
})
