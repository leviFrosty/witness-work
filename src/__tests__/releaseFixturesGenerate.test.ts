import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// Writes this build's release fixture for `releaseUpgrade.test.ts`: the
// scenario's records saved through the stores' own actions, as every persisted
// store's MMKV blob (`stores.json`) and as Settings → Export writes them
// (`backup.json`). Skipped unless RELEASE_FIXTURE names the version being cut:
//
//   RELEASE_FIXTURE=1.45.0 pnpm vitest run src/__tests__/releaseFixturesGenerate.test.ts
//
// See `docs/upgrade-fixtures.md`.

const RELEASE = process.env.RELEASE_FIXTURE

const disk = vi.hoisted(() => {
  // The time zone the scenario's dates are in.
  process.env.TZ = 'America/Chicago'
  return { data: new Map<string, string | boolean>(), uuid: 0 }
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
  errorTracking: { addBreadcrumb: vi.fn(), captureException: vi.fn() },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: process.env.RELEASE_FIXTURE } },
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

import {
  CATEGORIES,
  CONTACTS,
  CUSTOM_FIELD,
  DAY_PLANS,
  DELETED_CONTACT_ID,
  DELETED_DAY_PLAN,
  DELETED_ENTRY,
  DELETED_VISIT,
  DISMISSED,
  ENTRIES,
  RECURRING_DELETED_DATE,
  RECURRING_OVERRIDE,
  RECURRING_PLANS,
  VISITS,
  at,
  type ScenarioEntry,
} from '@/__tests__/__data__/releases/scenario'

/** The MMKV keys of the stores that hold the User's data. */
const PERSISTED_STORES = [
  'preferences',
  'contacts',
  'conversations',
  'serviceReports',
  'categories',
  'profile',
  'mileage',
  'petCompanion',
]

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
    // What Settings → Export writes.
    writeFileSync(`${out}/backup.json`, JSON.stringify(createBackupFile()))
  })
})
