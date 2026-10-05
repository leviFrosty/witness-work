import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WatchEntryDraft } from '../../modules/watch-bridge'

const bridge = vi.hoisted(() => ({
  activeComplications: null as string[] | null,
  pending: [] as WatchEntryDraft[],
  events: [] as { name: string; properties: Record<string, string> }[],
  snapshots: [] as string[],
  resolved: [] as string[][],
  inboxListener: null as null | (() => void),
}))

vi.mock('../../modules/watch-bridge', () => ({
  isAvailable: () => true,
  getStatus: () => ({
    isSupported: true,
    isPaired: true,
    isWatchAppInstalled: true,
    isComplicationEnabled: bridge.activeComplications != null,
    activeComplications: bridge.activeComplications,
  }),
  setSnapshot: (json: string) => bridge.snapshots.push(json),
  getPendingEntries: () => bridge.pending,
  resolveEntries: (ids: string[]) => {
    bridge.resolved.push(ids)
    bridge.pending = bridge.pending.filter((entry) => !ids.includes(entry.id))
  },
  takeEvents: () => bridge.events.splice(0),
  onInboxChange: (listener: () => void) => {
    bridge.inboxListener = listener
    return { remove: () => (bridge.inboxListener = null) }
  },
  onStatusChange: () => ({ remove: () => {} }),
}))

const capture = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', async () => ({
  ...(await import('@/__tests__/mocks/mmkv')),
  mmkvStorage: { getNumber: () => undefined, set: () => {} },
}))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
}))
// The real preferences and contact stores reach expo modules that need
// `__DEV__`; the time-entry store is the one under test.
const prefs = vi.hoisted(() => ({
  role: 'regularPioneer',
  roleHistory: null,
  publisherHours: {
    publisher: 0,
    regularAuxiliary: 30,
    regularPioneer: 50,
    circuitOverseer: 50,
    specialPioneer: 100,
    custom: 50,
  },
  monthlyGoalOverrides: {},
  overrideCreditLimit: false,
  customCreditLimitHours: 55,
  timeDisplayFormat: 'decimal',
  logsHours: false,
}))
const storeMock = vi.hoisted(
  () =>
    <T>(state: T) =>
      Object.assign(() => state, {
        getState: () => state,
        subscribe: () => () => {},
      })
)
vi.mock('@/stores/preferences', () => ({ usePreferences: storeMock(prefs) }))
vi.mock('@/stores/conversationStore', () => ({
  useConversations: storeMock({ conversations: [] }),
}))
vi.mock('@/stores/contactsStore', () => ({
  default: storeMock({ contacts: [] }),
}))
vi.mock('@/stores/categories', () => ({
  default: storeMock({ categories: [] }),
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
  DEFAULT_LOCALE: 'en-us',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false }],
}))

import { installWatchSync } from '@/app/watch/watchSync'
import useServiceReport from '@/stores/serviceReport'
import { getMonthsReports } from '@/lib/serviceReport'

const draft = (overrides: Partial<WatchEntryDraft> = {}): WatchEntryDraft => ({
  id: 'watch-1',
  date: '2026-10-04',
  hours: 2,
  minutes: 15,
  categoryId: null,
  origin: 'shortcut',
  ...overrides,
})

const octoberEntries = () =>
  getMonthsReports(useServiceReport.getState().serviceReports, 9, 2026)

describe('watch sync', () => {
  let teardown: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 4, 15))
    useServiceReport.setState({
      serviceReports: {},
      deletedServiceReports: [],
    })
    bridge.activeComplications = null
    bridge.pending = []
    bridge.events = []
    bridge.snapshots = []
    bridge.resolved = []
    capture.mockClear()
  })

  afterEach(() => {
    teardown?.()
    vi.useRealTimers()
  })

  it('saves pending watch entries, then resolves them', () => {
    bridge.pending = [draft()]

    teardown = installWatchSync()

    expect(octoberEntries()).toMatchObject([
      { id: 'watch-1', hours: 2, minutes: 15 },
    ])
    expect(bridge.resolved).toEqual([['watch-1']])
    expect(capture).toHaveBeenCalledWith('time_entry_created', {
      source: 'watch',
      watch_origin: 'shortcut',
      entry_mode: 'hours',
      has_category: false,
      has_note: false,
    })
  })

  it('sends progress that includes the entries before resolving them', () => {
    bridge.pending = [draft()]

    teardown = installWatchSync()

    const snapshot = JSON.parse(bridge.snapshots.at(-1)!)
    expect(snapshot.monthKey).toBe('2026-10')
    expect(snapshot.publisherState).toBe('reportedToday')
    expect(snapshot.monthMinutes).toBe(135)
  })

  it('names the entries a snapshot counts before they’re resolved', () => {
    bridge.pending = [draft()]

    teardown = installWatchSync()

    // The watch adds unresolved entries itself, so it mustn't add these.
    const beforeResolving = JSON.parse(bridge.snapshots[0])
    expect(beforeResolving.monthMinutes).toBe(135)
    expect(beforeResolving.reflectedEntryIds).toEqual(['watch-1'])
  })

  it('sends next month so the watch can start it before syncing', () => {
    teardown = installWatchSync()

    const snapshot = JSON.parse(bridge.snapshots.at(-1)!)
    expect(snapshot.monthName).toBe('October')
    expect(snapshot.nextMonth).toEqual({
      monthKey: '2026-11',
      monthName: 'November',
      goalHours: 50,
      showsTimeEntry: true,
    })
    expect(snapshot.plannedThroughDay).toBeNull()
    expect(snapshot.reflectedEntryIds).toEqual([])
    expect(snapshot.upNext).toEqual([])
  })

  it('reports which complications are in use', () => {
    bridge.activeComplications = ['WitnessWorkUpNext']

    teardown = installWatchSync()

    expect(capture).toHaveBeenCalledWith('watch_app_status', {
      complication_enabled: true,
      progress_complication: false,
      up_next_complication: true,
    })
  })

  it('adds a redelivered entry once', () => {
    bridge.pending = [draft()]
    teardown = installWatchSync()

    bridge.pending = [draft()]
    bridge.inboxListener?.()

    expect(octoberEntries()).toHaveLength(1)
    expect(bridge.resolved).toEqual([['watch-1'], ['watch-1']])
  })

  it('does not restore an entry deleted before it arrived', () => {
    useServiceReport.setState({
      deletedServiceReports: [{ id: 'watch-1', deletedAt: 1 }],
    })
    bridge.pending = [draft()]

    teardown = installWatchSync()

    expect(octoberEntries()).toHaveLength(0)
    expect(bridge.resolved).toEqual([['watch-1']])
    expect(capture).toHaveBeenCalledWith('watch_entry_skipped', {
      reason: 'deleted',
    })
  })

  it('forwards only known native analytics events', () => {
    bridge.events = [
      {
        name: 'watch_timer_action_completed',
        properties: { action: 'started', origin: 'app' },
      },
      { name: 'unexpected_event', properties: {} },
    ]

    teardown = installWatchSync()

    expect(capture).toHaveBeenCalledWith('watch_timer_action_completed', {
      action: 'started',
      origin: 'app',
    })
    expect(capture).not.toHaveBeenCalledWith(
      'unexpected_event',
      expect.anything()
    )
  })
})
