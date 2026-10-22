import { readFileSync, readdirSync } from 'node:fs'
import semver from 'semver'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Upgrading from a released build must keep the User's data. Each folder in
// `__data__/releases/` holds what that release saved: every persisted store as
// its persist middleware wrote it to MMKV (`stores.json`), and the file its
// Settings → Export wrote (`backup.json`), both from the same made-up records
// (`__data__/releases/scenario.ts`). This suite launches the current build on
// each one, through the real persist `migrate`/`merge`, the boot migrations and
// the backup restore, and checks that every record comes through.
// `docs/upgrade-fixtures.md` says how to add a release.

const disk = vi.hoisted(() => {
  const tz = process.env.TZ
  // The time zone the fixtures were written in.
  process.env.TZ = 'America/Chicago'
  return {
    tz,
    data: new Map<string, string | boolean>(),
    errors: [] as unknown[],
    uuid: 0,
  }
})

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    get size() {
      return disk.data.size
    }
    getBoolean(key: string) {
      const value = disk.data.get(key)
      return typeof value === 'boolean' ? value : undefined
    }
    getString(key: string) {
      const value = disk.data.get(key)
      return typeof value === 'string' ? value : undefined
    }
    set(key: string, value: string | boolean) {
      disk.data.set(key, value)
    }
    delete(key: string) {
      disk.data.delete(key)
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
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.45.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++disk.uuid}` }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: { ios?: unknown }) => o.ios },
  Alert: { alert: vi.fn() },
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
import type { TimeEntry } from '@/types/timeEntry'
import {
  CATEGORIES,
  CONTACTS,
  CUSTOM_FIELD,
  DAY_PLANS,
  DELETED_CONTACT_ID,
  DELETED_VISIT,
  DELETED_ENTRY,
  DELETED_DAY_PLAN,
  DISMISSED,
  ENTRIES,
  RECURRING_DELETED_DATE,
  RECURRING_OVERRIDE,
  RECURRING_PLANS,
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
  }
}
type App = Awaited<ReturnType<typeof launch>>

/** Each store's data, keyed by its storage name. */
const snapshot = (app: App) =>
  Object.fromEntries(
    Object.entries(app).map(([key, store]) => [key, data(store.getState())])
  )

function installRelease(release: string) {
  disk.data.clear()
  disk.errors.length = 0
  disk.data.set('hasMigratedFromAsyncStorage', true)
  for (const [key, blob] of Object.entries(fixtureStores(release)))
    disk.data.set(key, JSON.stringify(blob))
}

function freshInstall() {
  disk.data.clear()
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

type Source = 'storage' | 'backup'

/** What the release saved in `source`, by feature. */
function coverage(release: string, source: Source) {
  const inBackupSince = (version: string) =>
    source === 'storage' || since(release, version)
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
  }
}

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
  expect(dismissed.dismissedNotificationId).toBe(DISMISSED.notificationId)
}

function expectVisits(app: App, release: string, source: Source) {
  const { since140 } = coverage(release, source)
  const { conversations, deletedConversations } = app.conversations.getState()
  expect(ids(conversations)).toEqual(ids(VISITS))
  for (const want of VISITS) {
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
  expect(entries.map(({ entry }) => entry.id).sort()).toEqual(
    ENTRIES.map(({ id }) => id).sort()
  )
  const { categories } = app.categories.getState()
  for (const want of ENTRIES) {
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
  for (const [key, value] of Object.entries(want)) {
    if (source === 'backup' && NON_SYNCABLE_PREFERENCE_KEYS.has(key)) continue
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
    source === 'storage'
      ? fixtureStores(release).preferences.state
      : readJson<{ preferencesStore: Record<string, unknown> }>(
          `${DIR}/${release}/backup.json`
        ).preferencesStore
  ) as Record<string, unknown>
  const changed = Object.keys(savedPrefs).filter(
    (key) =>
      key in got &&
      !MIGRATED_PREFERENCES.has(key) &&
      !(source === 'backup' && NON_SYNCABLE_PREFERENCE_KEYS.has(key)) &&
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

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20, 9, 0))
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
