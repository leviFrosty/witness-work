import { existsSync, readFileSync, readdirSync } from 'node:fs'
import semver from 'semver'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Upgrading from a released build must keep the User's data. Each folder in
// `__data__/releases/` holds what that release saved: every persisted store as
// its persist middleware wrote it to MMKV (`stores.json`), the file its
// Settings → Export wrote (`backup.json`), and the file sync wrote to iCloud
// (`icloud.json`) and Google Drive (`google-drive.json`), all from the same
// made-up records (`__data__/releases/scenario.ts`). This suite launches the
// current build on each one, through the real persist `migrate`/`merge`, the
// boot migrations, the backup restore and the sync engine's restore and merge,
// and checks that every record and setting comes through.
// `docs/upgrade-fixtures.md` says how to add a release.

const disk = vi.hoisted(() => {
  const tz = process.env.TZ
  // The time zone the fixtures were written in.
  process.env.TZ = 'America/Chicago'
  return {
    tz,
    data: new Map<string, string | boolean>(),
    /** MMKV instances other than the default (`data`), by id. */
    instances: new Map<string, Map<string, string | boolean>>(),
    errors: [] as unknown[],
    uuid: 0,
    os: 'ios' as 'ios' | 'android',
    /** ICloud's container, or the Google Drive app data folder. */
    cloud: [] as { filename: string; json: string; modifiedAt: number }[],
  }
})

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    private readonly data: Map<string, string | boolean>
    constructor(config?: { id?: string }) {
      const id = config?.id
      if (id && !disk.instances.has(id)) disk.instances.set(id, new Map())
      this.data = id ? disk.instances.get(id)! : disk.data
    }
    get size() {
      return this.data.size
    }
    getBoolean(key: string) {
      const value = this.data.get(key)
      return typeof value === 'boolean' ? value : undefined
    }
    getString(key: string) {
      const value = this.data.get(key)
      return typeof value === 'string' ? value : undefined
    }
    getAllKeys() {
      return [...this.data.keys()]
    }
    contains(key: string) {
      return this.data.has(key)
    }
    set(key: string, value: string | boolean) {
      this.data.set(key, value)
    }
    delete(key: string) {
      this.data.delete(key)
    }
    trim() {}
  },
}))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
    getAllKeys: async () => [],
  },
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: {
    addBreadcrumb: vi.fn(),
    captureException: (error: unknown) => disk.errors.push(error),
    captureMessage: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.45.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  get osName() {
    return disk.os === 'ios' ? 'iOS' : 'Android'
  },
  get modelName() {
    return disk.os === 'ios' ? 'iPad Air' : 'Pixel 9'
  },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++disk.uuid}` }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return disk.os
    },
    select: (o: { ios?: unknown; android?: unknown; default?: unknown }) =>
      disk.os in o ? o[disk.os] : o.default,
  },
  Alert: { alert: vi.fn() },
  AppState: {
    currentState: 'background',
    addEventListener: () => ({ remove: () => {} }),
  },
}))
// Native modules behind the Map's address lookups, never reached here.
vi.mock('expo-location', () => ({}))
vi.mock('expo-linking', () => ({}))

// Sync. iOS reads iCloud through this bridge; Android registers `googleDrive`.
vi.mock('../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  supportsUploadStatus: () => false,
  identityToken: () => null,
  waitForInitialScan: async () => true,
  readFiles: async (include: (filename: string) => boolean) => ({
    files: disk.cloud.filter(({ filename }) => include(filename)),
    pending: [],
  }),
  write: async (filename: string, json: string) => {
    disk.cloud = [
      ...disk.cloud.filter((file) => file.filename !== filename),
      { filename, json, modifiedAt: Date.now() },
    ]
    return Date.now()
  },
  deleteFile: async () => {},
  addRemoteChangeListener: () => ({ remove: () => {} }),
  addAvailabilityChangeListener: () => ({ remove: () => {} }),
}))
vi.mock('@/lib/account', () => ({
  reclaimAccountFile: vi.fn(),
  clearAdoptedAccountId: vi.fn(),
}))
vi.mock('@/lib/installId', () => ({ getOrCreateInstallId: () => 'install' }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///upgraded/Documents/',
  getInfoAsync: async () => ({ exists: false }),
}))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}))
vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  refreshSyncClock: async () => null,
}))

import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import { NON_SYNCABLE_PREFERENCE_KEYS } from '@/lib/syncPreferencePolicy'
import {
  isStoredDateAnchored,
  localDayKey,
  storedDayKey,
} from '@/lib/normalizeDate'
import { getPlansIntersectingDay } from '@/lib/recurrence'
import { getCategoryLabel } from '@/lib/serviceReportCategory'
import { geocodeRetryKey } from '@/lib/geocodeRetry'
import { pinLookupKey } from '@/features/map/lib/geocodeContacts'
import { buddyAlertSettings, buddySettings } from '@/features/buddies/lib/state'
import type { SyncTransport } from '@/lib/syncTransport'
import type { TimeEntry } from '@/types/timeEntry'
import {
  APP_LOCK,
  BUDDIES,
  CALENDAR_SYNC,
  CATEGORIES,
  CONTACTS,
  CUSTOM_FIELD,
  DAILY_MINUTES,
  DAY_PLANS,
  DELETED_CONTACT_ID,
  DELETED_VISIT,
  DELETED_ENTRY,
  DELETED_DAY_PLAN,
  DISMISSED,
  ENTRIES,
  GEOCODE_RETRY,
  MAP_FIND_SKIP,
  NOTES_IMPORTS,
  RECURRING_DELETED_DATE,
  RECURRING_OVERRIDE,
  RECURRING_PLANS,
  SAVED_PLACES,
  SAVED_ROUTE,
  SCRIBE,
  SIDEBAR,
  SPLIT_SHEET_RATIO,
  STREAK_SEEN,
  TRAY,
  VISITS,
  at,
} from '@/__tests__/__data__/releases/scenario'

const DIR = `${__dirname}/__data__/releases`
const RELEASES = readdirSync(DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort(semver.compare)

type Blob = { state: Record<string, unknown>; version: number }
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8')) as T
const fixtureStores = (release: string) =>
  readJson<Record<string, Blob>>(`${DIR}/${release}/stores.json`)

type Cloud = 'icloud' | 'google-drive'
const CLOUDS: Cloud[] = ['icloud', 'google-drive']
type Payload = { deviceId: string; preferencesStore: { values: object } }
/** The sync files the release wrote, as each cloud holds them. */
const syncFiles = (release: string) =>
  CLOUDS.filter((cloud) => existsSync(`${DIR}/${release}/${cloud}.json`)).map(
    (cloud) => ({
      cloud,
      json: readFileSync(`${DIR}/${release}/${cloud}.json`, 'utf8'),
    })
  )
const syncPayloads = (release: string) =>
  syncFiles(release).map(({ json }) => JSON.parse(json) as Payload)

/** Whether `release` (a folder name like `v1.42.0`) is `version` or later. */
const since = (release: string, version: string) => semver.gte(release, version)

/** Every persisted store's blob, as the next launch would read it. */
const saved = (): Record<string, Blob> =>
  Object.fromEntries(
    [...disk.data]
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, JSON.parse(value as string) as Blob])
  )

/** The data a store holds, without its actions. */
const data = (state: object) =>
  JSON.parse(JSON.stringify(state)) as Record<string, unknown>

/**
 * Starts the current build on what's on `disk`: every persisted store hydrates
 * as it does at import, then the boot migrations run in `useAppMigrations`'
 * order.
 */
async function launch() {
  vi.resetModules()
  const { usePreferences } = await import('@/stores/preferences')
  const { default: useContacts } = await import('@/stores/contactsStore')
  const { default: useConversations } = await import(
    '@/stores/conversationStore'
  )
  const { default: useServiceReport } = await import('@/stores/serviceReport')
  const { default: useCategories } = await import('@/stores/categories')
  const { useProfile } = await import('@/stores/profile')
  const { default: useMileage } = await import('@/stores/mileage')
  const { default: usePet } = await import('@/stores/pet')
  // This device's settings and bookkeeping.
  const { useAppLockSettings } = await import('@/stores/appLock')
  const { useBuddies } = await import('@/features/buddies/stores/buddiesStore')
  const { useCalendarSync } = await import('@/stores/calendarSync')
  const { useGeocodeRetry } = await import('@/stores/geocodeRetry')
  const { useMapFindSkips } = await import('@/features/map/stores/mapFindSkips')
  const { useNotificationsTray } = await import(
    '@/features/notifications/stores/notificationsTray'
  )
  const { useTimeCache } = await import('@/stores/timeCache')
  const { useSavedPlaces } = await import(
    '@/features/route-planning/stores/savedPlaces'
  )
  const { useSavedRoutes } = await import(
    '@/features/route-planning/stores/savedRoutes'
  )
  const { useSidebarPreferences } = await import('@/stores/sidebar')
  const { useSplitSheetPreferences } = await import('@/stores/splitSheet')
  const { useStreakCelebration } = await import(
    '@/features/profile/stores/streakCelebration'
  )
  // Scribe AI's conversations, undo records and usage, on this device only.
  const { useScribeConversations } = await import(
    '@/features/scribe/stores/conversations'
  )
  const { useScribeLedger } = await import('@/features/scribe/stores/ledger')
  const { useScribeUsageStore } = await import('@/features/scribe/stores/usage')
  const { runCustomFieldsMigration } = await import(
    '@/features/contacts/lib/runCustomFieldsMigration'
  )
  const { runTagsToCategoriesMigration, runLdcCategoryMigration } =
    await import('@/stores/migrations/categories')
  const { runProfileMigration } = await import('@/stores/migrations/profile')
  const { migrateLegacyLocale } = await import(
    '@/features/settings/lib/migrateLegacyLocale'
  )
  runCustomFieldsMigration()
  runTagsToCategoriesMigration()
  runProfileMigration()
  runLdcCategoryMigration()
  migrateLegacyLocale()
  return {
    preferences: usePreferences,
    contacts: useContacts,
    conversations: useConversations,
    serviceReports: useServiceReport,
    categories: useCategories,
    profile: useProfile,
    mileage: useMileage,
    petCompanion: usePet,
    'app-lock': useAppLockSettings,
    buddies: useBuddies,
    'calendar-sync': useCalendarSync,
    'geocode-retry': useGeocodeRetry,
    'map-find-skips': useMapFindSkips,
    notificationsTray: useNotificationsTray,
    'plan-cache': useTimeCache,
    'route-saved-places': useSavedPlaces,
    'saved-routes': useSavedRoutes,
    'sidebar-layout': useSidebarPreferences,
    'split-sheet-layout': useSplitSheetPreferences,
    streakCelebration: useStreakCelebration,
    'scribe-conversations': useScribeConversations,
    'scribe-ledger': useScribeLedger,
    'scribe-usage': useScribeUsageStore,
  }
}
type App = Awaited<ReturnType<typeof launch>>

const SCRIBE_STORES = [
  'scribe-conversations',
  'scribe-ledger',
  'scribe-usage',
] as const

/** Each store's data, keyed by its storage name. */
const snapshot = (app: App) =>
  Object.fromEntries(
    Object.entries(app).map(([key, store]) => [key, data(store.getState())])
  )

function installRelease(release: string) {
  freshInstall()
  for (const [key, blob] of Object.entries(fixtureStores(release)))
    disk.data.set(key, JSON.stringify(blob))
  const instances = `${DIR}/${release}/mmkv.json`
  if (!existsSync(instances)) return
  for (const [id, values] of Object.entries(
    readJson<Record<string, Record<string, string>>>(instances)
  ))
    disk.instances.set(id, new Map(Object.entries(values)))
}

function freshInstall() {
  disk.data.clear()
  disk.instances.clear()
  disk.errors.length = 0
  disk.data.set('hasMigratedFromAsyncStorage', true)
}

const ms = (date: unknown) => new Date(date as string).getTime()
const ids = (records: unknown) =>
  ((records ?? []) as { id: string }[]).map(({ id }) => id).sort()
const allEntries = (app: App) =>
  Object.entries(app.serviceReports.getState().serviceReports).flatMap(
    ([year, months]) =>
      Object.entries(months).flatMap(([month, entries]) =>
        entries.map((entry) => ({ entry, bucket: `${year}-${month}` }))
      )
  )

/**
 * Where the data came from: the release's own storage, its backup file, its
 * sync file restored on a new device, or its storage after merging its sync
 * file on turning sync on.
 */
type Source = 'storage' | 'backup' | 'sync' | 'merged'

/** What the release saved in `source`, by feature. */
function coverage(release: string, source: Source) {
  // The sync file holds Profile and Categories from the start (1.40).
  const inBackupSince = (version: string) =>
    source !== 'backup' || since(release, version)
  return {
    // 1.37 had no contact favorites, Visit or Time Entry tombstones, Plan
    // details (time, title, location, Category), Profile or Categories.
    since140: since(release, '1.40.0'),
    // The backup file holds Profile, Categories and mileage since 1.44.
    profile: since(release, '1.40.0') && inBackupSince('1.44.0'),
    categories: since(release, '1.40.0') && inBackupSince('1.44.0'),
    mileage: since(release, '1.44.0'),
    roleHistory: since(release, '1.44.0'),
    pet: since(release, '1.45.0'),
    // What Scribe AI's added Proposal wrote syncs like any record.
    scribe: since(release, '1.45.0'),
  }
}

/** The scenario's Visits, and the one Scribe AI added where the release ran it. */
const scenarioVisits = (release: string, source: Source) =>
  coverage(release, source).scribe ? [...VISITS, SCRIBE.added.visit] : VISITS

/** The scenario's Time Entries, and the one Scribe AI added. */
const scenarioEntries = (release: string, source: Source) =>
  coverage(release, source).scribe ? [...ENTRIES, SCRIBE.added.entry] : ENTRIES

function expectContacts(app: App, release: string, source: Source) {
  const { since140 } = coverage(release, source)
  const { contacts, deletedContacts, customFieldDefs } = app.contacts.getState()
  const live = CONTACTS.filter(({ id }) => id !== DELETED_CONTACT_ID)
  expect(ids(contacts)).toEqual(ids(live))
  expect(ids(deletedContacts)).toContain(DELETED_CONTACT_ID)
  for (const want of live) {
    const got = contacts.find(({ id }) => id === want.id)!
    expect(got.name).toBe(want.name)
    expect(got.address).toEqual(want.address)
    expect(got.phone).toBe(want.phone)
    expect(got.email).toBe(want.email)
    expect(got.coordinate).toEqual(want.coordinate)
    expect(got.userDraggedCoordinate).toBe(want.userDraggedCoordinate)
    expect(ms(got.createdAt)).toBe(want.createdAt.getTime())
  }
  const field = customFieldDefs.find(
    (def) => def.label === CUSTOM_FIELD.label && !def.archived
  )
  expect(field).toBeDefined()
  const ada = contacts.find(({ id }) => id === CUSTOM_FIELD.contactId)!
  expect(ada.customFields?.[field!.id]).toBe(CUSTOM_FIELD.value)
  if (since140) expect(ada.isFavorite).toBe(true)
  const dismissed = contacts.find(({ id }) => id === DISMISSED.contactId)!
  expect(ms(dismissed.dismissedUntil)).toBe(DISMISSED.until.getTime())
  // The reminder belongs to the device that scheduled it; sync leaves it out
  // since 1.44.
  if (source !== 'sync')
    expect(dismissed.dismissedNotificationId).toBe(DISMISSED.notificationId)
}

function expectVisits(app: App, release: string, source: Source) {
  const { since140 } = coverage(release, source)
  const { conversations, deletedConversations } = app.conversations.getState()
  const visits = scenarioVisits(release, source)
  expect(ids(conversations)).toEqual(ids(visits))
  for (const want of visits) {
    const got = conversations.find(({ id }) => id === want.id)!
    expect(got.contact.id).toBe(want.contactId)
    expect(ms(got.date)).toBe(want.date.getTime())
    expect(got.isBibleStudy).toBe(want.isBibleStudy)
    expect(got.notAtHome ?? false).toBe(want.notAtHome ?? false)
    expect(got.note || undefined).toBe(want.note)
    if (want.followUp) {
      expect(got.followUp?.topic).toBe(want.followUp.topic)
      expect(got.followUp?.notifyMe).toBe(want.followUp.notifyMe)
      expect(ms(got.followUp?.date)).toBe(want.followUp.date.getTime())
      expect(got.followUp?.notifications?.map(({ id }) => id)).toEqual(
        want.followUp.notifications?.map(({ id }) => id)
      )
    } else {
      // Older forms attached an empty follow-up to every Visit; it isn't one.
      expect(got.followUp).toBeUndefined()
    }
  }
  if (since140) expect(ids(deletedConversations)).toContain(DELETED_VISIT.id)
}

function expectTimeEntries(app: App, release: string, source: Source) {
  const { since140, categories: hasCategories } = coverage(release, source)
  const entries = allEntries(app)
  const wanted = scenarioEntries(release, source)
  expect(entries.map(({ entry }) => entry.id).sort()).toEqual(ids(wanted))
  const { categories } = app.categories.getState()
  for (const want of wanted) {
    const { entry, bucket } = entries.find(({ entry }) => entry.id === want.id)!
    // On the noon-UTC anchor, so the day survives a time zone change.
    expect(isStoredDateAnchored(entry.date), want.id).toBe(true)
    expect(storedDayKey(entry.date), want.id).toBe(localDayKey(want.date))
    expect(bucket, want.id).toBe(
      `${want.date.getFullYear()}-${want.date.getMonth()}`
    )
    expect(entry.hours).toBe(want.hours)
    expect(entry.minutes).toBe(want.minutes)
    expect(entry.note || undefined).toBe(want.note)
    expectCategory(entry, want.kind, categories, hasCategories)
  }
  if (since140) {
    const tombstones = app.serviceReports.getState().deletedServiceReports
    expect(ids(tombstones)).toContain(DELETED_ENTRY.id)
  }
}

function expectCategory(
  entry: TimeEntry,
  kind: (typeof ENTRIES)[number]['kind'],
  categories: { id: string; name: string; isCredit: boolean }[],
  hasCategories: boolean
) {
  if (kind === 'plain') {
    expect(entry.categoryId).toBeUndefined()
    expect(entry.tag).toBeUndefined()
    expect(entry.credit ?? false).toBe(false)
    return
  }
  if (kind === 'ldc') {
    expect(entry.categoryId).toBe(LDC_BUILTIN_CATEGORY_ID)
    expect(entry.credit).toBe(true)
    return
  }
  const want = CATEGORIES[kind]
  expect(entry.credit ?? false, entry.id).toBe(want.isCredit)
  // A backup file from 1.40–1.43 doesn't hold the Categories its entries point
  // at, so restored on a new device they keep their credit but not their
  // Category's name. A known gap.
  if (!hasCategories && entry.categoryId) return
  expect(getCategoryLabel(entry, categories), entry.id).toBe(want.name)
  if (entry.categoryId) {
    const category = categories.find(({ id }) => id === entry.categoryId)
    expect(category?.isCredit).toBe(want.isCredit)
  }
}

function expectPlans(app: App, release: string, source: Source) {
  const { since140 } = coverage(release, source)
  const { dayPlans, recurringPlans } = app.serviceReports.getState()
  expect(ids(dayPlans)).toEqual(ids(DAY_PLANS))
  expect(ids(dayPlans)).not.toContain(DELETED_DAY_PLAN.id)
  for (const want of DAY_PLANS) {
    const got = dayPlans.find(({ id }) => id === want.id)!
    expect(storedDayKey(got.date), want.id).toBe(localDayKey(want.date))
    expect(got.minutes).toBe(want.minutes)
    expect(got.note || undefined).toBe(want.note)
  }
  if (since140) {
    const detailed = dayPlans.find(({ id }) => id === 'p-2')!
    expect(detailed.startTimeInMinutes).toBe(9 * 60)
    expect(detailed.title).toBe('Rural territory')
    expect(detailed.location?.name).toBe('Kingdom Hall')
    expect(detailed.categoryId).toBe(CATEGORIES.letters.id)
  }

  expect(ids(recurringPlans)).toEqual(ids(RECURRING_PLANS))
  for (const want of RECURRING_PLANS) {
    const got = recurringPlans.find(({ id }) => id === want.id)!
    expect(storedDayKey(got.startDate), want.id).toBe(
      localDayKey(want.startDate)
    )
    expect(got.minutes).toBe(want.minutes)
    expect(got.note || undefined).toBe(want.note)
    expect(got.recurrence.frequency).toBe(want.recurrence.frequency)
    expect(got.recurrence.interval).toBe(want.recurrence.interval)
    expect(
      got.recurrence.endDate === null
        ? null
        : storedDayKey(got.recurrence.endDate)
    ).toBe(
      want.recurrence.endDate === null
        ? null
        : localDayKey(want.recurrence.endDate)
    )
    expect(got.recurrence.monthlyByWeekdayConfig).toEqual(
      'monthlyByWeekdayConfig' in want.recurrence
        ? want.recurrence.monthlyByWeekdayConfig
        : undefined
    )
  }
  const storedDays = [
    ...dayPlans.map(({ date }) => date),
    ...recurringPlans.flatMap((plan) => [
      plan.startDate,
      ...(plan.recurrence.endDate ? [plan.recurrence.endDate] : []),
      ...(plan.overrides ?? []).map(({ date }) => date),
      ...(plan.deletedDates ?? []),
    ]),
  ]
  expect(storedDays.filter((date) => !isStoredDateAnchored(date))).toEqual([])

  const weekly = recurringPlans.find(
    ({ id }) => id === RECURRING_OVERRIDE.planId
  )!
  expect(
    weekly.overrides?.map((o) => [storedDayKey(o.date), o.minutes, o.note])
  ).toEqual([
    [
      localDayKey(RECURRING_OVERRIDE.date),
      RECURRING_OVERRIDE.minutes,
      RECURRING_OVERRIDE.note,
    ],
  ])
  // Before 1.44 a Day Plan hid that day's recurring instances; Plans add up
  // now, so the upgrade skips the instance under Day Plan p-3 to keep the
  // forecast as it was.
  const additive = since(release, '1.44.0')
  expect(weekly.deletedDates?.map(storedDayKey).sort()).toEqual(
    [
      localDayKey(RECURRING_DELETED_DATE.date),
      ...(additive ? [] : [localDayKey(at(2025, 9, 30))]),
    ].sort()
  )
  if (since140) expect(weekly.startTimeInMinutes).toBe(10 * 60)

  // The schedule still lands on the same days.
  const on = (day: Date) =>
    getPlansIntersectingDay(day, recurringPlans)
      .map(({ id }) => id)
      .sort()
  expect(on(at(2025, 9, 30))).toEqual(additive ? ['r-weekly'] : [])
  expect(on(at(2025, 10, 7))).toEqual(['r-weekly'])
  expect(on(at(2025, 9, 23))).toEqual([])
  expect(on(at(2025, 10, 4))).toEqual(['r-first-saturday'])
  expect(on(at(2025, 9, 19))).toEqual(['r-biweekly'])
  expect(on(at(2025, 9, 12))).toEqual([])
  expect(on(at(2026, 1, 3))).toEqual([])
}

/**
 * Preferences a migration rewrites on purpose: the sync timestamps follow the
 * preferences renamed since (`oneOffGoalHours` → `monthlyGoalOverrides`).
 */
const MIGRATED_PREFERENCES = new Set(['preferenceUpdatedAt'])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** `value` still holds `saved`; an object may have gained keys. */
const keeps = (value: unknown, saved: unknown): boolean =>
  isPlainObject(value) && isPlainObject(saved)
    ? Object.keys(saved).every((key) => keeps(value[key], saved[key]))
    : JSON.stringify(value) === JSON.stringify(saved)

function expectPreferences(app: App, release: string, source: Source) {
  const { since140, roleHistory, mileage } = coverage(release, source)
  const prefs = app.preferences.getState()
  const want: Record<string, unknown> = {
    role: 'regularPioneer',
    onboardingComplete: true,
    timeDisplayFormat: 'short',
    startOfWeek: 1,
    fontSizeOffset: 2,
    colorScheme: 'dark',
    contactSort: 'az',
    defaultNavigationMapProvider: 'google',
    returnVisitAlwaysNotify: true,
    hideDonateHeart: true,
    overrideCreditLimit: true,
    customCreditLimitHours: 60,
    installedOn: at(2025, 6, 1, 12, 0).getTime(),
    lastBackupDate: at(2025, 9, 30, 21, 0).getTime(),
    monthlyGoalOverrides: { '2025-12': 30 },
    ...(since140
      ? {
          tenureStartDate: at(2025, 9, 1).getTime(),
          offDays: [0],
          meetingDays: [3, 6],
        }
      : {}),
    ...(roleHistory
      ? {
          roleHistory: {
            initial: 'publisher',
            changes: {
              '2025-08': 'regularAuxiliary',
              '2025-09': 'regularPioneer',
            },
          },
          badgeLedger: ['first-hour', 'streak-4'],
          showStreaks: false,
        }
      : {}),
    ...(mileage ? { distanceUnit: 'km', mileageTrackingEnabled: true } : {}),
  }
  const got = data(prefs)
  // Turning sync on, or restoring onto a new device, keeps that device's own.
  const deviceLocal = (key: string) =>
    source !== 'storage' && NON_SYNCABLE_PREFERENCE_KEYS.has(key)
  for (const [key, value] of Object.entries(want)) {
    if (deviceLocal(key)) continue
    const actual =
      key === 'installedOn' ||
      key === 'lastBackupDate' ||
      key === 'tenureStartDate'
        ? ms(got[key])
        : got[key]
    expect(actual, key).toEqual(value)
  }
  expect(prefs.homeScreenElements.timer).toBe(false)
  expect(prefs.publisherHours.custom).toBe(40)

  // Every other preference the release saved, under a name this build still
  // uses, keeps its value.
  const savedPrefs = (
    source === 'backup'
      ? readJson<{ preferencesStore: Record<string, unknown> }>(
          `${DIR}/${release}/backup.json`
        ).preferencesStore
      : source === 'sync'
        ? syncPayloads(release)[0].preferencesStore.values
        : fixtureStores(release).preferences.state
  ) as Record<string, unknown>
  const changed = Object.keys(savedPrefs).filter(
    (key) =>
      key in got &&
      !MIGRATED_PREFERENCES.has(key) &&
      !deviceLocal(key) &&
      !keeps(got[key], savedPrefs[key])
  )
  expect(changed).toEqual([])
}

function expectCategories(app: App, release: string, source: Source) {
  const { categories } = app.categories.getState()
  expect(categories.map(({ id }) => id)).toContain(LDC_BUILTIN_CATEGORY_ID)
  if (!coverage(release, source).categories) {
    // 1.37's tags become Categories at launch. A 1.37 backup file restored
    // later keeps them as tags on its entries, which still label them.
    if (!since(release, '1.40.0') && source === 'storage') {
      for (const want of Object.values(CATEGORIES)) {
        const got = categories.find(({ name }) => name === want.name)
        expect(got?.isCredit, want.name).toBe(want.isCredit)
      }
    }
    return
  }
  for (const want of Object.values(CATEGORIES)) {
    const got = categories.find(({ id }) => id === want.id)
    expect(got?.name).toBe(want.name)
    expect(got?.isCredit).toBe(want.isCredit)
  }
  expect(ids(app.categories.getState().deletedCategories)).toContain('cat-gone')
}

function expectProfile(app: App, release: string, source: Source) {
  if (!coverage(release, source).profile) return
  const profile = app.profile.getState()
  expect(profile.name).toBe('Sam Rivera')
  expect(profile.hasCompletedProfileSetup).toBe(true)
  expect(profile.avatar).toEqual({ type: 'emoji', value: '🌻' })
  expect(profile.customAvatarBackground).toBe('#3A7D44')
}

function expectMileage(app: App, release: string, source: Source) {
  if (!coverage(release, source).mileage) return
  const state = app.mileage.getState()
  expect(ids(state.vehicles)).toEqual(['veh-1'])
  expect(ids(state.fuels)).toEqual(['fuel-1'])
  expect(ids(state.fuelPrices)).toEqual(['fp-1'])
  expect(ids(state.vehicleSetups)).toEqual(['vs-1'])
  expect(ids(state.trips)).toEqual(['trip-1', 'trip-2', 'trip-3'])
  expect(
    state.trips.map(({ id, date, distanceMiles }) => [id, date, distanceMiles])
  ).toEqual(
    expect.arrayContaining([
      ['trip-1', '2025-09-06', 12.4],
      ['trip-2', '2025-09-13', 31],
      ['trip-3', '2025-09-27', 8.2],
    ])
  )
  expect(ids(state.deletedMileageRecords)).toContain('trip-gone')
}

function expectPet(app: App, release: string, source: Source) {
  if (!coverage(release, source).pet) return
  const { pet } = app.petCompanion.getState()
  expect(pet?.species).toBe('dog')
  expect(pet?.coat).toBe('liver')
  expect(pet?.name).toBe('Biscuit')
  expect(pet?.adoptedOn).toBe('2025-09-01')
  expect(pet?.wakes).toEqual(['2025-09-02', '2025-09-03'])
  expect(pet?.keepsakes.map(({ kind }) => kind)).toEqual(['olive'])
}

function expectScenario(app: App, release: string, source: Source) {
  expectContacts(app, release, source)
  expectVisits(app, release, source)
  expectTimeEntries(app, release, source)
  expectPlans(app, release, source)
  expectPreferences(app, release, source)
  expectCategories(app, release, source)
  expectProfile(app, release, source)
  expectMileage(app, release, source)
  expectPet(app, release, source)
}

function expectBuddies(app: App) {
  const state = app.buddies.getState()
  const { noor, pip, invite, removed } = BUDDIES
  expect(state.onboardingComplete).toBe(true)
  expect(state.deviceId).toBe(BUDDIES.deviceId)
  expect(state.registeredInboxId).toBe(BUDDIES.registeredInboxId)
  expect(state.syncSeq).toBe(BUDDIES.syncSeq)
  expect(state.rosterVersion).toBe(BUDDIES.rosterVersion)
  expect(state.pushRegistrationKey).toBe(BUDDIES.pushRegistrationKey)
  expect(state.pushRegisteredAt).toBe(BUDDIES.pushRegisteredAt)
  // Each pairing with the keys its messages are sealed with.
  expect(state.buddies.map(({ inboxId }) => inboxId)).toEqual([
    noor.inboxId,
    pip.inboxId,
  ])
  const [gotNoor, gotPip] = state.buddies
  expect(gotNoor).toMatchObject(noor)
  expect(gotPip).toMatchObject(pip)
  // Noor's Plans stay off this User's calendar, and her requests to join stay
  // muted here.
  expect(buddySettings(state.sharing, gotNoor)).toMatchObject({
    settings: { showOnCalendar: false },
    sources: { showOnCalendar: 'buddy' },
  })
  expect(buddySettings(state.sharing, gotPip).settings.showOnCalendar).toBe(
    true
  )
  expect(buddyAlertSettings(state, noor.inboxId)).toMatchObject({
    settings: { joinRequests: false },
    sources: { joinRequests: 'buddy' },
  })
  expect(buddyAlertSettings(state, pip.inboxId).settings.joinRequests).toBe(
    true
  )
  expect(state.outgoingInvites).toEqual([invite])
  expect(state.removedBuddies).toEqual({
    [removed.inboxId]: removed.removedAt,
  })
  expect(state.pendingRemovals).toEqual([
    {
      inboxId: removed.inboxId,
      dhPub: removed.dhPub,
      inviteSecret: removed.inviteSecret,
    },
  ])
  expect(state.sharing).toMatchObject({
    ...BUDDIES.sharing,
    tenure: true,
    streak: true,
    badges: true,
  })
}

/**
 * Notes Import's history. Scribe AI replaced Notes Import (ADR 0032), and only
 * accepted imports stay, for Undo in History. The release's two were never
 * accepted (one read and waiting, one still reading), so the old ledger still
 * reads but offers neither, and the launch cleanup drops them.
 */
/** Notes Import's ledger rows still on the device, by MMKV key. */
const notesImportRows = () => [
  ...(disk.instances.get('notes-import-ledger')?.keys() ?? []),
]

async function expectNotesImports() {
  const { listLegacyImports, pruneLegacyLedger } = await import(
    '@/features/scribe/legacy/notesImportLedger'
  )
  const { ready, working } = NOTES_IMPORTS
  expect(listLegacyImports()).toEqual([])
  pruneLegacyLedger()
  expect(notesImportRows()).not.toContain(`entry:${ready.hash}`)
  expect(notesImportRows()).not.toContain(`entry:${working.hash}`)
  expect(listLegacyImports()).toEqual([])
}

/** The scenario's Scribe AI conversation, and its Proposals in turn order. */
function scribeConversation(app: App) {
  const conversations = Object.values(
    app['scribe-conversations'].getState().conversations
  )
  expect(conversations).toHaveLength(1)
  const [conversation] = conversations
  const [added, waiting] = conversation.items.flatMap((item) =>
    item.type === 'proposal' ? [conversation.proposals[item.proposalId]] : []
  )
  return { conversation, added, waiting }
}

/**
 * Scribe AI's conversation, the undo record of the Proposal the User added, and
 * the last usage snapshot: each as the release saved it, the waiting Proposal
 * still ready to review and add, and the added one still undoable.
 */
async function expectScribe(app: App, release: string) {
  const stores = fixtureStores(release)
  // Nothing migrates them yet.
  for (const key of SCRIBE_STORES)
    expect(data(app[key].getState()), key).toMatchObject(stores[key].state)

  const { conversation, added, waiting } = scribeConversation(app)
  expect(app['scribe-conversations'].getState().hasFinishedTurn).toBe(true)
  // Every turn finished, so launch offers none to try again.
  expect(conversation.suspended).toBeNull()
  expect(
    conversation.items.flatMap((item) =>
      item.type === 'user' || item.type === 'assistant'
        ? [[item.type, item.text]]
        : []
    )
  ).toEqual(
    SCRIBE.turns.flatMap(({ text, answer }) => [
      ['user', text],
      ['assistant', answer],
    ])
  )
  // Its Refs still name the same records.
  const { refs } = conversation
  expect(refs.byRef[refs.byId['c:c-dora']]).toEqual({ kind: 'c', id: 'c-dora' })
  expect(refs.byRef[refs.byId[`k:${CATEGORIES.letters.id}`]]).toEqual({
    kind: 'k',
    id: CATEGORIES.letters.id,
  })
  expect(refs.byRef.n1).toEqual({
    kind: 'n',
    proposalId: waiting.id,
    boundId: null,
  })

  const { toScribeProposal, canAddProposal } = await import(
    '@/features/scribe/proposals/cards'
  )
  const { readScribeStores } = await import(
    '@/features/scribe/runtime/snapshot'
  )
  expect(conversation.pendingProposalId).toBe(waiting.id)
  expect(canAddProposal(waiting)).toBe(true)
  const review = toScribeProposal(waiting, readScribeStores())
  expect(review).toMatchObject({ status: 'pending', invalidCount: 0 })
  expect(review.cards).toMatchObject([
    {
      kind: 'plan',
      selected: false,
      status: 'pending',
      effects: [
        {
          preview: {
            kind: 'plan.create',
            date: '2025-10-11',
            minutes: 120,
            startMinutes: 9 * 60,
          },
        },
      ],
    },
    {
      kind: 'contact',
      selected: true,
      needsChoice: false,
      status: 'pending',
      contact: { type: 'new', name: 'Lena Park' },
    },
  ])

  const { visit, entry } = SCRIBE.added
  expect(added.status).toBe('applied')
  const record = app['scribe-ledger'].getState().records[added.id]
  expect(record.appliedAt).toBe(SCRIBE.added.at.getTime())
  expect(record.effects.map(({ undo }) => undo)).toEqual([
    { kind: 'visit.create', visitId: visit.id },
    { kind: 'time.create', entryId: entry.id },
  ])
  const { undoable } = await import('@/features/scribe/stores/ledger')
  expect(undoable(record, Date.now())).toBe(true)
  // What Undo would take back is still there.
  expect(ids(app.conversations.getState().conversations)).toContain(visit.id)
  expect(allEntries(app).map(({ entry }) => entry.id)).toContain(entry.id)

  expect(app['scribe-usage'].getState().snapshot).toEqual(SCRIBE.usage)
}

/**
 * This device's own settings and bookkeeping. Neither sync nor the backup file
 * holds them, so an upgrade that drops one loses it for good.
 */
async function expectDeviceSettings(app: App, release: string) {
  if (since(release, '1.44.0')) {
    expect(app['calendar-sync'].getState()).toMatchObject(CALENDAR_SYNC)
    expect(app['sidebar-layout'].getState()).toMatchObject(SIDEBAR)
    expect(app.streakCelebration.getState().seen).toEqual(STREAK_SEEN)
    const tray = app.notificationsTray.getState()
    const stamped = (itemIds: string[]) =>
      Object.fromEntries(itemIds.map((id) => [id, TRAY.at]))
    expect(tray.arrivals).toEqual(stamped(TRAY.arrivals))
    expect(tray.seen).toEqual(stamped(TRAY.seen))
    expect(tray.dismissed).toEqual(stamped(TRAY.dismissed))
    expect(app['plan-cache'].getState().dailyMinutes).toMatchObject(
      DAILY_MINUTES
    )
    expectBuddies(app)
    await expectNotesImports()
  }
  if (since(release, '1.45.0')) {
    expect(app['app-lock'].getState()).toMatchObject(APP_LOCK)
    // App Lock still covers the app on its first launch.
    const { useAppLockSession } = await import('@/stores/appLock')
    expect(useAppLockSession.getState().locked).toBe(true)
    expect(app['split-sheet-layout'].getState().ratio).toBe(SPLIT_SHEET_RATIO)
    const { contacts } = app.contacts.getState()
    const contact = (id: string) => contacts.find((c) => c.id === id)!
    // The queued pin lookup still applies to the Contact's address.
    expect(app['geocode-retry'].getState().queue).toEqual([
      {
        contactId: GEOCODE_RETRY.contactId,
        key: geocodeRetryKey(contact(GEOCODE_RETRY.contactId)),
        attempts: GEOCODE_RETRY.attempts,
        notBefore: expect.any(Number),
      },
    ])
    expect(app['map-find-skips'].getState().skipped).toEqual([
      pinLookupKey(contact(MAP_FIND_SKIP.contactId)),
    ])
    expect(app['route-saved-places'].getState().places).toEqual(SAVED_PLACES)
    expect(
      app['saved-routes'].getState().routes[SAVED_ROUTE.day]
    ).toMatchObject(SAVED_ROUTE)
    await expectScribe(app, release)
  }
}

/** Android's Google Drive app data folder, holding the same files. */
const googleDrive: SyncTransport = {
  kind: 'google-drive',
  writeConfirmsUpload: true,
  isAvailable: () => true,
  identityToken: () => 'google-account',
  identityTokenMatches: (stored) => stored === 'google-account',
  waitForInitialScan: async () => true,
  readFiles: async (include) => ({
    files: disk.cloud.filter(({ filename }) => include(filename)),
    pending: [],
  }),
  write: async (filename, json) => {
    disk.cloud = [
      ...disk.cloud.filter((file) => file.filename !== filename),
      { filename, json, modifiedAt: Date.now() },
    ]
    return Date.now()
  },
  supportsUploadStatus: () => false,
  uploadStatus: async () => null,
  deleteFile: async () => {},
  deleteAll: async () => {},
  writeBinary: async () => Date.now(),
  readBinary: async () => Date.now(),
  listBinaryFiles: async () => [],
  deleteBinaryFile: async () => {},
  deleteAllBinaries: async () => {},
  addRemoteChangeListener: () => ({ remove: () => {} }),
  addAvailabilityChangeListener: () => ({ remove: () => {} }),
}

/**
 * Puts the file `release` wrote to `cloud` there, as another of the User's
 * devices left it, and makes this device one that syncs through `cloud`.
 */
function installCloud(release: string, cloud: Cloud) {
  const { json } = syncFiles(release).find((file) => file.cloud === cloud)!
  const { deviceId, writtenAt } = JSON.parse(json) as {
    deviceId: string
    writtenAt: number
  }
  disk.os = cloud === 'icloud' ? 'ios' : 'android'
  disk.cloud = [
    { filename: `witness-work-${deviceId}.json`, json, modifiedAt: writtenAt },
  ]
}

/** The sync engine on this platform's transport, for a Supporter. */
async function syncEngine() {
  const sync = await import('@/app/sync/iCloudSync')
  const { registerAndroidSyncTransport, syncTransport } = await import(
    '@/lib/syncTransport'
  )
  if (disk.os === 'android') registerAndroidSyncTransport(googleDrive)
  expect(syncTransport().kind).toBe(
    disk.os === 'ios' ? 'icloud' : 'google-drive'
  )
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  useSupporter.getState().setSupporter(true)
  return sync
}

/** Every record in a sync file this build wrote, by kind. */
function syncedRecordIds(json: string) {
  const payload = JSON.parse(json) as {
    contactStore: { contacts: unknown }
    conversationStore: { conversations: unknown }
    serviceReportStore: {
      serviceReports: Record<string, Record<string, { id: string }[]>>
      dayPlans: unknown
      recurringPlans: unknown
    }
  }
  const { serviceReportStore } = payload
  return {
    contacts: ids(payload.contactStore.contacts),
    visits: ids(payload.conversationStore.conversations),
    entries: Object.values(serviceReportStore.serviceReports)
      .flatMap((months) => Object.values(months).flat())
      .map(({ id }) => id)
      .sort(),
    dayPlans: ids(serviceReportStore.dayPlans),
    recurringPlans: ids(serviceReportStore.recurringPlans),
  }
}

const TODAY = new Date(2026, 9, 20, 9, 0)

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})
afterAll(() => {
  vi.useRealTimers()
  if (disk.tz === undefined) delete process.env.TZ
  else process.env.TZ = disk.tz
})

it('has a fixture for at least four releases', () => {
  expect(RELEASES.length).toBeGreaterThanOrEqual(4)
})

describe.each(RELEASES)('upgrading from %s', (release) => {
  let app: App
  let firstLaunch: ReturnType<typeof saved>
  beforeAll(async () => {
    installRelease(release)
    app = await launch()
    firstLaunch = saved()
  })

  it('loads every store without an error, at its current version', () => {
    expect(disk.errors).toEqual([])
    for (const key of Object.keys(fixtureStores(release))) {
      const store = app[key as keyof App]
      expect(store.persist.hasHydrated(), key).toBe(true)
      expect(firstLaunch[key]?.version, key).toBe(
        store.persist.getOptions().version
      )
    }
  })

  it('keeps every record and setting', () => {
    expectScenario(app, release, 'storage')
  })

  // ADR 0040 §2: an install from before sync was free keeps its sync as it
  // was, and isn't given Cloud Sync's new-install default.
  it('reads as an install from before sync was free', () => {
    expect(app.preferences.getState().installedBeforeFreeSync).toBe(true)
    expect(app.preferences.getState()).not.toHaveProperty(
      'iCloudSyncPausedForLapse'
    )
  })

  it('keeps every tombstone', () => {
    for (const [key, blob] of Object.entries(fixtureStores(release))) {
      const state = data(app[key as keyof App].getState())
      for (const [field, value] of Object.entries(blob.state)) {
        if (!field.startsWith('deleted') || !Array.isArray(value)) continue
        expect(ids(state[field]), `${key}.${field}`).toEqual(
          expect.arrayContaining(ids(value))
        )
      }
    }
  })

  it('changes nothing on the next launch', async () => {
    const before = snapshot(app)
    const next = await launch()
    expect(disk.errors).toEqual([])
    expect(saved()).toEqual(firstLaunch)
    expect(snapshot(next)).toEqual(before)
  })
})

describe.each(RELEASES)('restoring a backup file from %s', (release) => {
  let app: App
  let result: unknown
  beforeAll(async () => {
    freshInstall()
    app = await launch()
    const { isBackupFile } = await import('@/lib/backupFile')
    const { restoreBackupFile } = await import('@/app/sync/backupFileRestore')
    // `useBackupImport`: parse, check, restore.
    const file: unknown = JSON.parse(
      readFileSync(`${DIR}/${release}/backup.json`, 'utf8')
    )
    expect(isBackupFile(file)).toBe(true)
    result = restoreBackupFile(file as never)
  })

  it('restores without dropping a record', () => {
    expect(result).toEqual({ ok: true, droppedRecords: 0 })
    expect(disk.errors).toEqual([])
  })

  it('keeps every record and synced setting', () => {
    expectScenario(app, release, 'backup')
  })

  it('keeps the restored data on the next launch', async () => {
    const before = snapshot(app)
    const next = await launch()
    expect(disk.errors).toEqual([])
    expect(snapshot(next)).toEqual(before)
    expectScenario(next, release, 'backup')
  })
})

// Launched the morning after the release saved them, as a device updating
// overnight would be: Buddies and the bell drop what has lapsed by launch, and
// a year-old bell entry is gone by design.
describe.each(RELEASES.filter((release) => since(release, '1.44.0')))(
  "upgrading from %s keeps this device's settings",
  (release) => {
    let app: App
    beforeAll(async () => {
      vi.setSystemTime(at(2025, 10, 7, 9, 0))
      installRelease(release)
      app = await launch()
    })
    afterAll(() => {
      vi.setSystemTime(TODAY)
    })

    it("keeps them, and reads Notes Import's history", async () => {
      expect(disk.errors).toEqual([])
      // Releases before Scribe AI wrote Notes Import's ledger.
      const { ready, working } = NOTES_IMPORTS
      if (!since(release, '1.45.0'))
        expect(notesImportRows()).toEqual(
          expect.arrayContaining([
            `entry:${ready.hash}`,
            `entry:${working.hash}`,
          ])
        )
      await expectDeviceSettings(app, release)
    })

    it('keeps them on the next launch', async () => {
      const before = snapshot(app)
      const blobs = saved()
      const next = await launch()
      expect(disk.errors).toEqual([])
      await expectDeviceSettings(next, release)
      if (since(release, '1.45.0'))
        for (const key of SCRIBE_STORES) {
          expect(saved()[key], key).toEqual(blobs[key])
          expect(snapshot(next)[key], key).toEqual(before[key])
        }
    })

    it.runIf(since(release, '1.45.0'))(
      "adds Scribe AI's waiting Proposal and undoes the added one",
      async () => {
        const app = await launch()
        const { added, waiting } = scribeConversation(app)
        const { addScribeProposal, undoScribeProposalNow } = await import(
          '@/features/scribe/proposals/actions'
        )
        const { visit, entry } = SCRIBE.added
        expect(undoScribeProposalNow(added.id, 'history')).toEqual({
          status: 'undone',
          kept: 0,
        })
        expect(ids(app.conversations.getState().conversations)).not.toContain(
          visit.id
        )
        expect(allEntries(app).map(({ entry }) => entry.id)).not.toContain(
          entry.id
        )
        // The unchecked Plan stays out.
        expect(addScribeProposal(waiting.id)).toEqual({
          status: 'partially_applied',
          appliedCards: 1,
          skippedCards: 0,
        })
        const lena = app.contacts
          .getState()
          .contacts.find(({ name }) => name === 'Lena Park')
        expect(lena).toBeDefined()
        expect(
          app.conversations
            .getState()
            .conversations.filter(({ contact }) => contact.id === lena!.id)
        ).toHaveLength(1)
        expect(ids(app.serviceReports.getState().dayPlans)).toEqual(
          ids(DAY_PLANS)
        )
        expect(disk.errors).toEqual([])
      }
    )
  }
)

const SYNC_FILES = RELEASES.flatMap((release) =>
  syncFiles(release).map(({ cloud }) => [release, cloud] as const)
)

it('has sync files from the latest release and an older format', () => {
  expect(SYNC_FILES).toContainEqual([RELEASES.at(-1), 'icloud'])
  expect(SYNC_FILES).toContainEqual([RELEASES.at(-1), 'google-drive'])
  expect(new Set(SYNC_FILES.map(([release]) => release)).size).toBeGreaterThan(
    1
  )
})

describe.each(SYNC_FILES)(
  "restoring %s's %s file on a new device",
  (release, cloud) => {
    let app: App
    beforeAll(async () => {
      freshInstall()
      installCloud(release, cloud)
      app = await launch()
      const sync = await syncEngine()
      // Turning sync on with nothing of its own yet takes the cloud's data.
      const decision = await sync.resolveInitialEnable()
      expect(decision.outcome).toBe('pull')
      if (decision.outcome === 'pull') sync.applyPullEnable(decision.remote)
    })
    afterAll(() => {
      disk.os = 'ios'
      disk.cloud = []
    })

    it('restores every record and synced setting', () => {
      expect(disk.errors).toEqual([])
      expectScenario(app, release, 'sync')
    })

    it('keeps the restored data on the next launch', async () => {
      const before = snapshot(app)
      const next = await launch()
      expect(disk.errors).toEqual([])
      expect(snapshot(next)).toEqual(before)
    })
  }
)

describe.each(SYNC_FILES)(
  'turning sync on after upgrading from %s, with its %s file in the cloud',
  (release, cloud) => {
    let app: App
    let pushed: boolean
    beforeAll(async () => {
      installRelease(release)
      installCloud(release, cloud)
      app = await launch()
      const sync = await syncEngine()
      const decision = await sync.resolveInitialEnable()
      expect(decision.outcome).toBe('conflict')
      if (decision.outcome !== 'conflict') return
      // "Merge both", as Settings runs it (`PreferencesiCloudScreen`).
      sync.backfillUpdatedAtIfNeeded()
      sync.joinRemoteResetEpoch(decision.remote)
      app.preferences.getState().set({
        iCloudSyncEnabled: true,
        iCloudSyncNeedsResolution: false,
        iCloudFreshSetup: false,
      })
      await sync.pullAndMerge('initial-enable-merge')
      pushed = await sync.push('initial-enable-merge')
    })
    afterAll(() => {
      disk.os = 'ios'
      disk.cloud = []
    })

    it('merges and pushes without an error', () => {
      expect(app.preferences.getState().iCloudSyncIssue).toBeFalsy()
      expect(pushed).toBe(true)
      expect(disk.errors).toEqual([])
    })

    it('keeps every record and setting, once each', () => {
      expectScenario(app, release, 'merged')
    })

    it('pushes every record for the other devices', () => {
      const { deviceId } = syncPayloads(release).find(
        (_, i) => syncFiles(release)[i].cloud === cloud
      )!
      const mine = disk.cloud.filter(
        ({ filename }) => filename !== `witness-work-${deviceId}.json`
      )
      expect(mine).toHaveLength(1)
      expect(syncedRecordIds(mine[0].json)).toEqual({
        contacts: ids(CONTACTS.filter(({ id }) => id !== DELETED_CONTACT_ID)),
        visits: ids(scenarioVisits(release, 'merged')),
        entries: ids(scenarioEntries(release, 'merged')),
        dayPlans: ids(DAY_PLANS),
        recurringPlans: ids(RECURRING_PLANS),
      })
    })
  }
)

describe('a fresh install', () => {
  it('reads as a new install, and stays one on the next launch', async () => {
    freshInstall()
    const app = await launch()
    expect(app.preferences.getState().installedBeforeFreeSync).toBe(false)
    app.preferences.getState().set({ onboardingComplete: true })
    const next = await launch()
    expect(next.preferences.getState().installedBeforeFreeSync).toBe(false)
    expect(next.preferences.getState().onboardingComplete).toBe(true)
  })
})

describe('data saved by a newer build', () => {
  const latest = RELEASES.at(-1)!

  it('loads a store a newer version wrote without migrating or overwriting it', async () => {
    installRelease(latest)
    const stores = fixtureStores(latest)
    const contacts = stores.contacts
    const future: Blob = {
      version: contacts.version + 1,
      state: {
        ...contacts.state,
        contacts: (contacts.state.contacts as object[]).map((c) => ({
          ...c,
          futureField: { nested: true },
        })),
        futureCollection: [{ id: 'x' }],
      },
    }
    disk.data.set('contacts', JSON.stringify(future))
    const app = await launch()
    expect(ids(app.contacts.getState().contacts)).toEqual(
      ids(contacts.state.contacts)
    )
    app.contacts.getState().toggleFavoriteContact('c-bram')
    expect(JSON.parse(disk.data.get('contacts') as string)).toEqual(future)
  })

  it('refuses a backup file from a newer format and changes nothing', async () => {
    installRelease(latest)
    const app = await launch()
    const before = snapshot(app)
    const { BACKUP_FILE_VERSION } = await import('@/lib/backupFile')
    const { restoreBackupFile } = await import('@/app/sync/backupFileRestore')
    const file = readJson<Record<string, unknown>>(
      `${DIR}/${latest}/backup.json`
    )
    expect(
      restoreBackupFile({
        ...file,
        version: BACKUP_FILE_VERSION + 1,
      } as Parameters<typeof restoreBackupFile>[0])
    ).toEqual({ ok: false, problem: 'newer' })
    expect(snapshot(app)).toEqual(before)
  })
})
