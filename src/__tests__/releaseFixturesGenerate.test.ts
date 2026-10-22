import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// Writes this build's release fixture for `releaseUpgrade.test.ts`: the
// scenario's records saved through the stores' own actions, as every persisted
// store's MMKV blob (`stores.json`), as Settings → Export writes them
// (`backup.json`), as sync writes this device's file to iCloud (`icloud.json`)
// and to Google Drive (`google-drive.json`), and the MMKV instances of their own
// that hold the User's work (`mmkv.json`). Skipped unless RELEASE_FIXTURE names
// the version being cut:
//
//   RELEASE_FIXTURE=1.45.0 pnpm vitest run src/__tests__/releaseFixturesGenerate.test.ts
//
// See `docs/upgrade-fixtures.md`.

const RELEASE = process.env.RELEASE_FIXTURE

const disk = vi.hoisted(() => {
  // The time zone the scenario's dates are in.
  process.env.TZ = 'America/Chicago'
  return {
    data: new Map<string, string | boolean>(),
    uuid: 0,
    /** MMKV instances other than the default (`data`), by id. */
    instances: new Map<string, Map<string, string | boolean>>(),
    os: 'ios' as 'ios' | 'android',
    /** Files sync wrote to the cloud, by name. */
    cloud: new Map<string, string>(),
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
  errorTracking: { addBreadcrumb: vi.fn(), captureException: vi.fn() },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: process.env.RELEASE_FIXTURE } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  get osName() {
    return disk.os === 'ios' ? 'iOS' : 'Android'
  },
  get modelName() {
    return disk.os === 'ios' ? 'iPhone 16' : 'Pixel 8'
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

// Sync's cloud: iCloud's ubiquity container on iOS (here), the Google Drive app
// data folder on Android (`googleDrive` below).
vi.mock('../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  supportsUploadStatus: () => false,
  identityToken: () => null,
  waitForInitialScan: async () => true,
  readFiles: async () => ({ files: [], pending: [] }),
  write: async (filename: string, json: string) => {
    disk.cloud.set(filename, json)
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
  documentDirectory: 'file:///fixture/Documents/',
  getInfoAsync: async () => ({ exists: false }),
}))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}))
vi.mock('@/lib/address', () => ({ fetchCoordinateFromAddress: vi.fn() }))
vi.mock('@/lib/syncClock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/syncClock')>()),
  refreshSyncClock: async () => null,
}))

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
  DELETED_DAY_PLAN,
  DELETED_ENTRY,
  DELETED_VISIT,
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
  SIDEBAR,
  SPLIT_SHEET_RATIO,
  STREAK_SEEN,
  TRAY,
  VISITS,
  at,
  type ScenarioEntry,
} from '@/__tests__/__data__/releases/scenario'
import type { SyncTransport } from '@/lib/syncTransport'

/** The MMKV keys of the persisted stores. */
const PERSISTED_STORES = [
  // The User's data.
  'preferences',
  'contacts',
  'conversations',
  'serviceReports',
  'categories',
  'profile',
  'mileage',
  'petCompanion',
  // This device's settings and bookkeeping.
  'app-lock',
  'buddies',
  'calendar-sync',
  'geocode-retry',
  'map-find-skips',
  'notificationsTray',
  'plan-cache',
  'route-saved-places',
  'saved-routes',
  'sidebar-layout',
  'split-sheet-layout',
  'streakCelebration',
]

/** MMKV instances of their own that hold more than a cache. */
const MMKV_INSTANCES = ['notes-import-ledger']

/** Android's sync transport, holding its files where iCloud's would be. */
const googleDrive: SyncTransport = {
  kind: 'google-drive',
  writeConfirmsUpload: true,
  isAvailable: () => true,
  identityToken: () => 'google-account',
  identityTokenMatches: (stored) => stored === 'google-account',
  waitForInitialScan: async () => true,
  readFiles: async () => ({ files: [], pending: [] }),
  write: async (filename, json) => {
    disk.cloud.set(filename, json)
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
 * The file this device writes when the User turns sync on, on `os`: the
 * per-device snapshot every other device reads.
 */
async function firstSyncFile(os: 'ios' | 'android') {
  vi.resetModules()
  disk.os = os
  disk.cloud.clear()
  const { applySeedEnable } = await import('@/app/sync/iCloudSync')
  const { registerAndroidSyncTransport } = await import('@/lib/syncTransport')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  if (os === 'android') registerAndroidSyncTransport(googleDrive)
  // A Supporter turning sync on, with nothing in the cloud yet.
  useSupporter.getState().setSupporter(true)
  await applySeedEnable()
  const files = [...disk.cloud].filter(([name]) =>
    /^witness-work-(?!account).*\.json$/.test(name)
  )
  expect(files).toHaveLength(1)
  return files[0][1]
}

describe.skipIf(!RELEASE)('release fixture', () => {
  it(`writes v${RELEASE}`, async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(2025, 10, 6, 20, 0))
    disk.data.set('hasMigratedFromAsyncStorage', true)

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
    const { LDC_BUILTIN_CATEGORY_ID } = await import('@/constants/categories')
    const { createBackupFile } = await import('@/lib/backupFile')

    // A fresh install runs its boot migrations first (`useAppMigrations`).
    const { runCustomFieldsMigration } = await import(
      '@/features/contacts/lib/runCustomFieldsMigration'
    )
    const { runTagsToCategoriesMigration, runLdcCategoryMigration } =
      await import('@/stores/migrations/categories')
    const { runProfileMigration } = await import('@/stores/migrations/profile')
    runCustomFieldsMigration()
    runTagsToCategoriesMigration()
    runProfileMigration()
    runLdcCategoryMigration()

    // --- Preferences, changed from their defaults
    const prefs = usePreferences.getState()
    prefs.set({
      onboardingComplete: true,
      installedOn: at(2025, 6, 1, 12, 0),
      timeDisplayFormat: 'short',
      startOfWeek: 1,
      fontSizeOffset: 2,
      colorScheme: 'dark',
      contactSort: 'az',
      defaultNavigationMapProvider: 'google',
      returnVisitAlwaysNotify: true,
      hideDonateHeart: true,
      showStreaks: false,
      homeScreenElements: {
        ...prefs.homeScreenElements,
        timer: false,
        didYouKnow: false,
      },
      publisherHours: { ...prefs.publisherHours, custom: 40 },
      lastBackupDate: at(2025, 9, 30, 21, 0),
      mileageTrackingEnabled: true,
      distanceUnit: 'km',
      offDays: [0],
      meetingDays: [3, 6],
      submittedReportMonths: ['2025-07', '2025-08'],
      earnedBadges: {
        'first-hour': { at: at(2025, 7, 5, 12).getTime(), month: '2025-07' },
        'streak-4': {
          at: at(2025, 8, 30, 12).getTime(),
          month: '2025-08',
          history: true,
        },
      },
      badgeLedger: ['first-hour', 'streak-4'],
    })
    prefs.setOverrideCreditLimit(true)
    prefs.setCustomCreditLimitHours(60)
    usePreferences
      .getState()
      .setRoleForMonths(
        { year: 2025, month: 7 },
        { year: 2025, month: 7 },
        'regularAuxiliary'
      )
    usePreferences
      .getState()
      .setRole('regularPioneer', { from: { year: 2025, month: 8 } })
    usePreferences.getState().set({ tenureStartDate: at(2025, 9, 1) })
    usePreferences
      .getState()
      .setMonthlyGoalOverride({ year: 2025, month: 11 }, 30)

    // --- Profile
    useProfile.getState().set({
      name: 'Sam Rivera',
      hasCompletedProfileSetup: true,
      avatar: { type: 'emoji', value: '🌻' },
      customAvatarBackground: '#3A7D44',
    })

    // --- Categories
    for (const category of Object.values(CATEGORIES))
      useCategories.getState().addCategory(category)
    useCategories
      .getState()
      .addCategory({ id: 'cat-gone', name: 'Old category', isCredit: false })
    useCategories.getState().deleteCategory('cat-gone')

    // --- Contacts
    const field = useContacts.getState().addCustomFieldDef(CUSTOM_FIELD.label)
    for (const contact of CONTACTS) {
      useContacts.getState().addContact({
        ...contact,
        ...(contact.id === CUSTOM_FIELD.contactId && field
          ? { customFields: { [field.id]: CUSTOM_FIELD.value } }
          : {}),
      })
    }
    useContacts.getState().toggleFavoriteContact(CUSTOM_FIELD.contactId)
    useContacts
      .getState()
      .dismissContact(
        DISMISSED.contactId,
        DISMISSED.until,
        DISMISSED.notificationId
      )
    useContacts.getState().deleteContact(DELETED_CONTACT_ID)

    // --- Visits
    const toVisit = ({ contactId, ...visit }: { contactId: string }) => ({
      ...visit,
      contact: { id: contactId },
    })
    for (const visit of VISITS)
      useConversations.getState().addConversation(toVisit(visit) as never)
    useConversations.getState().addConversation(toVisit(DELETED_VISIT) as never)
    useConversations.getState().deleteConversation(DELETED_VISIT.id)

    // --- Time entries
    const toEntry = ({ kind, ...entry }: ScenarioEntry) => ({
      ...entry,
      ...(kind === 'ldc'
        ? { categoryId: LDC_BUILTIN_CATEGORY_ID, credit: true }
        : kind === 'plain'
          ? {}
          : {
              categoryId: CATEGORIES[kind].id,
              ...(CATEGORIES[kind].isCredit ? { credit: true } : {}),
            }),
    })
    for (const entry of ENTRIES)
      useServiceReport.getState().addServiceReport(toEntry(entry))
    useServiceReport.getState().addServiceReport(toEntry(DELETED_ENTRY))
    useServiceReport.getState().deleteServiceReport(toEntry(DELETED_ENTRY))

    // --- Plans
    for (const plan of DAY_PLANS) {
      useServiceReport.getState().addDayPlan({
        ...plan,
        ...(plan.id === 'p-2'
          ? {
              startTimeInMinutes: 9 * 60,
              title: 'Rural territory',
              location: { name: 'Kingdom Hall', address: '100 Main St' },
              categoryId: CATEGORIES.letters.id,
            }
          : {}),
      })
    }
    useServiceReport.getState().addDayPlan(DELETED_DAY_PLAN)
    useServiceReport.getState().deleteDayPlan(DELETED_DAY_PLAN.id)
    for (const plan of RECURRING_PLANS) {
      useServiceReport.getState().addRecurringPlan({
        ...plan,
        ...(plan.id === RECURRING_OVERRIDE.planId
          ? { startTimeInMinutes: 10 * 60 }
          : {}),
      })
    }
    const { planId, ...override } = RECURRING_OVERRIDE
    useServiceReport.getState().addRecurringPlanOverride(planId, override)
    useServiceReport
      .getState()
      .deleteSingleEventFromRecurringPlan(
        RECURRING_DELETED_DATE.planId,
        RECURRING_DELETED_DATE.date
      )

    // --- Mileage
    const mileage = useMileage.getState()
    const created = (date: Date) => date.getTime()
    mileage.saveVehicle({
      id: 'veh-1',
      name: 'Blue hatchback',
      createdAt: created(at(2025, 7, 1)),
    })
    mileage.saveFuel({
      id: 'fuel-1',
      name: 'Regular',
      createdAt: created(at(2025, 7, 1)),
    })
    mileage.saveFuelPrice({
      id: 'fp-1',
      fuelId: 'fuel-1',
      effectiveFrom: '2025-07-01',
      pricePerGallon: 3.19,
    })
    mileage.saveVehicleSetup({
      id: 'vs-1',
      vehicleId: 'veh-1',
      effectiveFrom: '2025-07-01',
      fuelId: 'fuel-1',
      milesPerGallon: 34,
    })
    mileage.saveTrip({
      id: 'trip-1',
      vehicleId: 'veh-1',
      date: '2025-09-06',
      distanceMiles: 12.4,
      roundTrip: true,
      createdAt: created(at(2025, 9, 6, 13)),
    })
    mileage.saveTrip({
      id: 'trip-2',
      vehicleId: 'veh-1',
      date: '2025-09-13',
      distanceMiles: 31,
      note: 'Bethel',
      createdAt: created(at(2025, 9, 13, 16)),
    })
    mileage.saveTrip({
      id: 'trip-3',
      vehicleId: 'veh-1',
      date: '2025-09-27',
      distanceMiles: 8.2,
      odometerStartMiles: 40210,
      odometerEndMiles: 40218.2,
      createdAt: created(at(2025, 9, 27, 12)),
    })
    mileage.saveTrip({
      id: 'trip-gone',
      vehicleId: 'veh-1',
      date: '2025-09-28',
      distanceMiles: 3,
      createdAt: created(at(2025, 9, 28, 12)),
    })
    useMileage.getState().deleteTrip('trip-gone')

    // --- Pet
    usePet.getState().adopt({
      species: 'dog',
      coat: 'liver',
      name: 'Biscuit',
      today: '2025-09-01',
    })
    usePet.getState().recordWake('2025-09-02')
    usePet.getState().recordWake('2025-09-03')
    usePet.getState().collectKeepsake('olive', '2025-09-03')

    // --- This device's settings and bookkeeping
    const { useAppLockSettings } = await import('@/stores/appLock')
    const { useSidebarPreferences } = await import('@/stores/sidebar')
    const { useSplitSheetPreferences } = await import('@/stores/splitSheet')
    const { useCalendarSync } = await import('@/stores/calendarSync')
    const { useTimeCache } = await import('@/stores/timeCache')
    const { useGeocodeRetry } = await import('@/stores/geocodeRetry')
    const { useStreakCelebration } = await import(
      '@/features/profile/stores/streakCelebration'
    )
    const tray = await import(
      '@/features/notifications/stores/notificationsTray'
    )
    const { useBuddies } = await import(
      '@/features/buddies/stores/buddiesStore'
    )
    const { skipPinLookups } = await import(
      '@/features/map/stores/mapFindSkips'
    )
    const { pinLookupKey } = await import('@/features/map/lib/geocodeContacts')
    const { useSavedPlaces } = await import(
      '@/features/route-planning/stores/savedPlaces'
    )
    const { useSavedRoutes } = await import(
      '@/features/route-planning/stores/savedRoutes'
    )
    useAppLockSettings.getState().set(APP_LOCK)
    useSidebarPreferences.getState().setWidth(SIDEBAR.width)
    if (SIDEBAR.hidden) useSidebarPreferences.getState().toggle()
    useSplitSheetPreferences.getState().setRatio(SPLIT_SHEET_RATIO)
    useCalendarSync.setState(CALENDAR_SYNC)
    useTimeCache
      .getState()
      .setDailyMinutesCache(DAILY_MINUTES.daily, DAILY_MINUTES.fingerprint)
    useStreakCelebration.setState({ seen: STREAK_SEEN })
    tray.recordArrivals(TRAY.arrivals, TRAY.at)
    tray.markSeen(TRAY.seen, TRAY.at)
    tray.dismissNotifications(TRAY.dismissed, TRAY.at)
    const { noor, pip, invite, removed } = BUDDIES
    useBuddies.setState({
      onboardingComplete: true,
      deviceId: BUDDIES.deviceId,
      registeredInboxId: BUDDIES.registeredInboxId,
      syncSeq: BUDDIES.syncSeq,
      rosterVersion: BUDDIES.rosterVersion,
      lastSyncAt: at(2025, 10, 6, 19, 0).getTime(),
      pushRegistrationKey: BUDDIES.pushRegistrationKey,
      pushRegisteredAt: BUDDIES.pushRegisteredAt,
      buddies: [{ ...noor, overrides: { showOnCalendar: false } }, pip],
      alertOverrides: { [noor.inboxId]: { joinRequests: false } },
      outgoingInvites: [invite],
      removedBuddies: { [removed.inboxId]: removed.removedAt },
      pendingRemovals: [
        {
          inboxId: removed.inboxId,
          dhPub: removed.dhPub,
          inviteSecret: removed.inviteSecret,
        },
      ],
      sharing: { ...useBuddies.getState().sharing, ...BUDDIES.sharing },
    })
    const retry = CONTACTS.find(({ id }) => id === GEOCODE_RETRY.contactId)!
    useGeocodeRetry.getState().enqueue(retry)
    const queued = useGeocodeRetry.getState().queue[0]
    useGeocodeRetry.getState().settle(queued, {
      ...queued,
      attempts: GEOCODE_RETRY.attempts,
      notBefore: at(2025, 10, 6, 20, 30).getTime(),
    })
    skipPinLookups([
      pinLookupKey(
        useContacts
          .getState()
          .contacts.find(({ id }) => id === MAP_FIND_SKIP.contactId)!
      ),
    ])
    useSavedPlaces.getState().set('home', SAVED_PLACES.home)
    useSavedRoutes.getState().save({ ...SAVED_ROUTE, updatedAt: Date.now() })

    // --- Notes Import's history
    const ledger = await import('@/features/notes-import/lib/notesImportLedger')
    const { ready, working } = NOTES_IMPORTS
    ledger.beginWorkingEntry(ready.hash, {
      notesText: ready.notesText,
      activeRun: { importId: 'import-ready' },
      nowMs: ready.createdAt,
    })
    ledger.putParsedResult(ready.hash, ready.result, ready.parsedAt)
    ledger.markViewed(ready.hash, ready.viewedAt)
    ledger.beginWorkingEntry(working.hash, {
      notesText: working.notesText,
      activeRun: { importId: working.activeRun.importId },
      nowMs: working.createdAt,
    })

    const out = `${__dirname}/__data__/releases/v${RELEASE}`
    mkdirSync(out, { recursive: true })
    const stores = Object.fromEntries(
      PERSISTED_STORES.map((key) => {
        const blob = disk.data.get(key)
        expect(typeof blob, key).toBe('string')
        return [key, JSON.parse(blob as string)]
      })
    )
    writeFileSync(`${out}/stores.json`, JSON.stringify(stores, null, 1) + '\n')
    writeFileSync(
      `${out}/mmkv.json`,
      JSON.stringify(
        Object.fromEntries(
          MMKV_INSTANCES.map((id) => [
            id,
            Object.fromEntries(disk.instances.get(id) ?? []),
          ])
        ),
        null,
        1
      ) + '\n'
    )
    // What Settings → Export writes.
    writeFileSync(`${out}/backup.json`, JSON.stringify(createBackupFile()))

    // What sync writes to the cloud, from the same records.
    const saved = new Map(disk.data)
    for (const [os, file] of [
      ['ios', 'icloud.json'],
      ['android', 'google-drive.json'],
    ] as const) {
      disk.data.clear()
      for (const [key, value] of saved) disk.data.set(key, value)
      writeFileSync(`${out}/${file}`, await firstSyncFile(os))
    }
  })
})
