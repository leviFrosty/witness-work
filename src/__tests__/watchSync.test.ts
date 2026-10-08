import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  WatchEntryDraft,
  WatchTripDraft,
} from '../../modules/watch-bridge'

const bridge = vi.hoisted(() => ({
  isPaired: true,
  activeComplications: null as string[] | null,
  pending: [] as WatchEntryDraft[],
  pendingTrips: [] as WatchTripDraft[],
  events: [] as { name: string; properties: Record<string, string> }[],
  snapshots: [] as string[],
  resolved: [] as string[][],
  inboxListener: null as null | (() => void),
}))

vi.mock('../../modules/watch-bridge', () => ({
  isAvailable: () => true,
  getStatus: () => ({
    isSupported: true,
    isPaired: bridge.isPaired,
    isWatchAppInstalled: bridge.isPaired,
    isComplicationEnabled: bridge.activeComplications != null,
    activeComplications: bridge.activeComplications,
  }),
  setSnapshot: (json: string) => bridge.snapshots.push(json),
  getPendingEntries: () => bridge.pending,
  getPendingTrips: () => bridge.pendingTrips,
  resolveEntries: (ids: string[]) => {
    bridge.resolved.push(ids)
    bridge.pending = bridge.pending.filter((entry) => !ids.includes(entry.id))
    bridge.pendingTrips = bridge.pendingTrips.filter(
      (trip) => !ids.includes(trip.id)
    )
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
const platform = vi.hoisted(() => ({ OS: 'ios' as 'ios' | 'android' }))
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: {
    get OS() {
      return platform.OS
    },
    select: (options: { ios?: unknown }) => options.ios,
  },
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
  mileageTrackingEnabled: true,
  distanceUnit: 'km',
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
vi.mock('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'US', currencyCode: 'USD' }],
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
import useMileage from '@/stores/mileage'
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

const tripDraft = (
  overrides: Partial<WatchTripDraft> = {}
): WatchTripDraft => ({
  id: 'trip-1',
  date: '2026-10-04',
  vehicleId: 'car-1',
  distanceMiles: 12.5,
  roundTrip: false,
  origin: 'phoneShortcut',
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
    useMileage.setState({
      vehicles: [
        { id: 'car-1', name: 'Mazda', createdAt: 1 },
        { id: 'car-2', name: 'Old car', archived: true, createdAt: 1 },
      ],
      trips: [],
      deletedMileageRecords: [],
    })
    platform.OS = 'ios'
    bridge.isPaired = true
    bridge.activeComplications = null
    bridge.pending = []
    bridge.pendingTrips = []
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

  it('reports entries made with Siri on this device as Siri', () => {
    bridge.pending = [draft({ origin: 'phoneShortcut' })]

    teardown = installWatchSync()

    expect(octoberEntries()).toHaveLength(1)
    expect(capture).toHaveBeenCalledWith('time_entry_created', {
      source: 'siri',
      entry_mode: 'hours',
      has_category: false,
      has_note: false,
    })
  })

  it('saves trips logged with Siri, then resolves them', () => {
    bridge.pendingTrips = [tripDraft({ roundTrip: true, distanceMiles: 25 })]

    teardown = installWatchSync()

    expect(useMileage.getState().trips).toMatchObject([
      {
        id: 'trip-1',
        vehicleId: 'car-1',
        date: '2026-10-04',
        distanceMiles: 25,
        roundTrip: true,
      },
    ])
    expect(bridge.resolved).toEqual([['trip-1']])
    expect(capture).toHaveBeenCalledWith('mileage_trip_added', {
      entry_mode: 'distance',
      round_trip: true,
      has_note: false,
      logged_again: false,
      source: 'siri',
    })
  })

  it('resolves entries and trips together', () => {
    bridge.pending = [draft()]
    bridge.pendingTrips = [tripDraft({ origin: 'shortcut' })]

    teardown = installWatchSync()

    expect(bridge.resolved).toEqual([['watch-1', 'trip-1']])
    expect(capture).toHaveBeenCalledWith(
      'mileage_trip_added',
      expect.objectContaining({ source: 'watch' })
    )
  })

  it('keeps the snapshot current for Siri without a paired watch', () => {
    bridge.isPaired = false

    teardown = installWatchSync()

    const snapshot = JSON.parse(bridge.snapshots.at(-1)!)
    expect(snapshot.mileage).toEqual({
      enabled: true,
      distanceUnit: 'km',
      vehicles: [{ id: 'car-1', name: 'Mazda' }],
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
      progress_complication_styles: undefined,
      up_next_complication: true,
    })
  })

  it('reports each Monthly Progress style in use', () => {
    bridge.activeComplications = [
      'WitnessWorkProgressRange',
      'WitnessWorkProgressSymbol',
    ]

    teardown = installWatchSync()

    expect(capture).toHaveBeenCalledWith('watch_app_status', {
      complication_enabled: true,
      progress_complication: true,
      progress_complication_styles: 'range,symbol',
      up_next_complication: false,
    })
  })

  it('sends a Wear OS watch its own strings, saying phone for iPhone', () => {
    platform.OS = 'android'

    teardown = installWatchSync()

    const { strings } = JSON.parse(bridge.snapshots.at(-1)!)
    expect(strings.watchSetUp).toBe('watchSetUpAndroid')
    expect(strings.watchSyncing).toBe('watchSyncingAndroid')
    expect(strings.addTime).toBe('addTime')
    expect(strings.siriTimerSaved).toBe('siriTimerSaved')
  })

  it('builds no snapshot on Android until a Wear OS watch has the app', () => {
    platform.OS = 'android'
    bridge.isPaired = false

    teardown = installWatchSync()

    expect(bridge.snapshots).toEqual([])
  })

  it('sends the Apple Watch only its own strings', () => {
    teardown = installWatchSync()

    const { strings } = JSON.parse(bridge.snapshots.at(-1)!)
    expect(strings.watchSetUp).toBe('watchSetUp')
    expect(strings).not.toHaveProperty('siriTimerSaved')
  })

  it('reports the Wear OS tile with the complications', () => {
    platform.OS = 'android'
    bridge.activeComplications = ['WitnessWorkProgress', 'WitnessWorkTile']

    teardown = installWatchSync()

    expect(capture).toHaveBeenCalledWith('watch_app_status', {
      complication_enabled: true,
      progress_complication: true,
      progress_complication_styles: 'default',
      up_next_complication: false,
      tile: true,
    })
  })

  it.each(['tile', 'ongoing_activity'] as const)(
    'saves Wear OS entries made from the %s',
    (origin) => {
      platform.OS = 'android'
      bridge.pending = [draft({ origin, hours: 0, minutes: 0 })]

      teardown = installWatchSync()

      expect(octoberEntries()).toHaveLength(1)
      expect(capture).toHaveBeenCalledWith('time_entry_created', {
        source: 'watch',
        watch_origin: origin,
        entry_mode: 'checkbox',
        has_category: false,
        has_note: false,
      })
    }
  )

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
      {
        name: 'siri_action_completed',
        properties: { action: 'log_trip', device: 'iphone' },
      },
      { name: 'unexpected_event', properties: {} },
    ]

    teardown = installWatchSync()

    expect(capture).toHaveBeenCalledWith('watch_timer_action_completed', {
      action: 'started',
      origin: 'app',
    })
    expect(capture).toHaveBeenCalledWith('siri_action_completed', {
      action: 'log_trip',
      device: 'iphone',
    })
    expect(capture).not.toHaveBeenCalledWith(
      'unexpected_event',
      expect.anything()
    )
  })
})
