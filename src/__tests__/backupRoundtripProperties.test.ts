import fc from 'fast-check'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: vi.fn() },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
}))
vi.mock('../../modules/icloud-bridge', () => ({}))
vi.mock('@/lib/account', () => ({
  reclaimAccountFile: vi.fn(),
  clearAdoptedAccountId: vi.fn(),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  getDeviceTypeAsync: async () => 1,
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
vi.mock('expo-document-picker', () => ({}))
vi.mock('@/lib/installId', () => ({
  getOrCreateInstallId: () => 'install',
  androidDeviceInstallId: () => 'install',
}))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/Documents/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { createBackupFile } from '@/lib/backupFile'
import { restoreBackupFile } from '@/app/sync/backupFileRestore'
import {
  buildBackupPlaintext,
  foldBackupPayloads,
  readBackupPayload,
  replaceLocalWithBackup,
} from '@/app/account/backupData'
import {
  deriveBackupKey,
  openBackup,
  sealBackup,
} from '@/lib/serverAccount/backupCrypto'
import { localPetSnapshot } from '@/app/sync/petStoreSync'
import { localMileageSnapshot } from '@/app/sync/mileageStoreSync'
import { canonicalJson } from '@/lib/canonicalJson'
import { setOwnAccountClaim } from '@/lib/accountClaimRegistry'
import useCategories from '@/stores/categories'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useMileage from '@/stores/mileage'
import usePet from '@/stores/pet'
import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import useServiceReport from '@/stores/serviceReport'
import { emptyDevice, type DeviceState } from '@/__tests__/helpers/syncPeer'
import {
  PINNED_NOW,
  deviceArb,
  deviceSnapshot,
  fcSeed,
  stampArb,
  textArb,
} from '@/__tests__/helpers/dataArbitraries'

// Export → import for both backups, over generated store contents: the JSON
// backup file (Settings → Export, `createBackupFile` / `restoreBackupFile`)
// and the account backup (`buildBackupPlaintext` → sealed slot → opened,
// `readBackupPayload`, `foldBackupPayloads`, `replaceLocalWithBackup`).
// Restoring a backup onto an empty install must give back every record and
// the synced settings as they were. Reproduce a failure with
// `FC_SEED=<seed> pnpm vitest run src/__tests__/backupRoundtripProperties.test.ts`.

const runs = { numRuns: 60, seed: fcSeed }

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PINNED_NOW)
})
afterAll(() => {
  vi.useRealTimers()
})

/** Synced settings the backups carry, varied over their shapes. */
const settingsArb = fc.record(
  {
    role: fc.constantFrom('publisher', 'regularPioneer', 'specialPioneer'),
    offDays: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 3 }),
    monthlyGoalOverrides: fc.dictionary(
      fc.constantFrom('2026-09', '2026-12', '2027-01'),
      fc.constantFrom(0, 30, 72.5)
    ),
    reportCommentOverrides: fc.dictionary(
      fc.constantFrom('2026-09', '2026-10'),
      textArb
    ),
    customAccentColor: fc.constantFrom(null, '#3366ff'),
    distanceUnit: fc.constantFrom('mi', 'km'),
    mileageTrackingEnabled: fc.boolean(),
    startOfWeek: fc.integer({ min: 0, max: 6 }),
    contactSort: fc.constantFrom('suggested', 'az', 'city'),
  },
  { requiredKeys: [] }
)

const profileArb = fc.record(
  { name: textArb, hasCompletedProfileSetup: fc.boolean() },
  { requiredKeys: [] }
)

type Settings =
  fc.Arbitrary<unknown> extends never ? never : Record<string, unknown>

const EMPTY_STORES = {
  contacts: {
    contacts: [],
    deletedContacts: [],
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  },
  conversations: {
    conversations: [],
    deletedConversations: [],
    conversationFieldDefs: [],
    deletedConversationFieldDefs: [],
  },
  serviceReport: {
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
    deletedServiceReports: [],
    deletedDayPlans: [],
    deletedRecurringPlans: [],
  },
  categories: { categories: [], deletedCategories: [] },
  mileage: {
    vehicles: [],
    fuels: [],
    fuelPrices: [],
    vehicleSetups: [],
    trips: [],
    deletedMileageRecords: [],
  },
  pet: { pet: null, room: null, deletedPetRecords: [] },
}

/** A fresh install: empty stores, default settings. */
const resetStores = () => {
  useContacts.setState(EMPTY_STORES.contacts)
  useConversations.setState(EMPTY_STORES.conversations)
  useServiceReport.setState(EMPTY_STORES.serviceReport)
  useCategories.setState(EMPTY_STORES.categories)
  useMileage.setState(EMPTY_STORES.mileage)
  usePet.setState(EMPTY_STORES.pet)
  usePreferences.setState({
    ...structuredClone(PREFERENCE_DEFAULTS),
    preferenceUpdatedAt: {},
  })
  useProfile.setState({ name: '', hasCompletedProfileSetup: false })
}

/** Puts `device`'s records and the settings into the stores. */
const fillStores = (
  device: DeviceState,
  settings: Settings,
  profile: Record<string, unknown>
) => {
  resetStores()
  useContacts.setState({
    contacts: device.contacts,
    deletedContacts: device.deletedContacts,
    customFieldDefs: device.customFieldDefs,
    deletedCustomFieldDefs: device.deletedCustomFieldDefs,
  })
  useConversations.setState({
    conversations: device.conversations,
    deletedConversations: device.deletedConversations,
    conversationFieldDefs: device.conversationFieldDefs,
    deletedConversationFieldDefs: device.deletedConversationFieldDefs,
  })
  useServiceReport.setState({
    serviceReports: device.serviceReports,
    dayPlans: device.dayPlans,
    recurringPlans: device.recurringPlans,
    deletedServiceReports: device.deletedServiceReports,
    deletedDayPlans: device.deletedDayPlans,
    deletedRecurringPlans: device.deletedRecurringPlans,
  })
  useCategories.setState({
    categories: device.categories,
    deletedCategories: device.deletedCategories,
  })
  useMileage.setState({
    vehicles: device.vehicles,
    fuels: device.fuels,
    fuelPrices: device.fuelPrices,
    vehicleSetups: device.vehicleSetups,
    trips: device.trips,
    deletedMileageRecords: device.deletedMileageRecords,
  })
  usePet.setState({
    pet: device.pets[0] ?? null,
    room: device.petRooms[0] ?? null,
    deletedPetRecords: device.deletedPetRecords,
  })
  usePreferences.setState(structuredClone(settings))
  useProfile.setState(structuredClone(profile))
}

/** `device`'s records alone: settings come from their own generators here. */
const recordsOf = (device: DeviceState): DeviceState => ({
  ...device,
  preferencesValues: {},
  preferenceUpdatedAt: {},
  profileValues: {},
  profileUpdatedAt: {},
})

/** The stores' synced records, as a device. */
const storesDevice = (): DeviceState => {
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const reports = useServiceReport.getState()
  const categories = useCategories.getState()
  return emptyDevice({
    contacts: contacts.contacts,
    deletedContacts: contacts.deletedContacts,
    customFieldDefs: contacts.customFieldDefs,
    deletedCustomFieldDefs: contacts.deletedCustomFieldDefs,
    conversations: conversations.conversations,
    deletedConversations: conversations.deletedConversations,
    conversationFieldDefs: conversations.conversationFieldDefs,
    deletedConversationFieldDefs: conversations.deletedConversationFieldDefs,
    serviceReports: reports.serviceReports,
    dayPlans: reports.dayPlans,
    recurringPlans: reports.recurringPlans,
    deletedServiceReports: reports.deletedServiceReports,
    deletedDayPlans: reports.deletedDayPlans,
    deletedRecurringPlans: reports.deletedRecurringPlans,
    categories: categories.categories,
    deletedCategories: categories.deletedCategories,
    ...localMileageSnapshot(),
    ...localPetSnapshot(),
  })
}

const settingsOf = (keys: string[]) => {
  const prefs = usePreferences.getState() as unknown as Record<string, unknown>
  return canonicalJson(
    JSON.parse(
      JSON.stringify(Object.fromEntries(keys.map((key) => [key, prefs[key]])))
    )
  )
}
const profileOf = (keys: string[]) => {
  const profile = useProfile.getState() as unknown as Record<string, unknown>
  return canonicalJson(
    Object.fromEntries(keys.map((key) => [key, profile[key]]))
  )
}

const ACCOUNT_KEY = new Uint8Array(32).fill(7)
const ADDRESS = { accountId: 'account', slotId: 'slot' }

beforeEach(resetStores)

describe('JSON backup file', () => {
  it('restores every record and synced setting it exported', () => {
    fc.assert(
      fc.property(
        deviceArb,
        settingsArb,
        profileArb,
        (device, settings, profile) => {
          fillStores(device, settings, profile)
          const before = deviceSnapshot(storesDevice())
          expect(before).toBe(deviceSnapshot(recordsOf(device)))
          const file = JSON.parse(JSON.stringify(createBackupFile()))

          resetStores()
          expect(restoreBackupFile(file)).toEqual({
            ok: true,
            droppedRecords: 0,
          })

          expect(deviceSnapshot(storesDevice())).toBe(before)
          expect(settingsOf(Object.keys(settings))).toBe(
            canonicalJson(JSON.parse(JSON.stringify(settings)))
          )
          expect(profileOf(Object.keys(profile))).toBe(canonicalJson(profile))
        }
      ),
      runs
    )
  })

  it('restoring a backup twice is the same as once', () => {
    fc.assert(
      fc.property(deviceArb, settingsArb, (device, settings) => {
        fillStores(device, settings, {})
        const file = JSON.parse(JSON.stringify(createBackupFile()))
        resetStores()
        restoreBackupFile(structuredClone(file))
        const once = deviceSnapshot(storesDevice())
        restoreBackupFile(structuredClone(file))
        expect(deviceSnapshot(storesDevice())).toBe(once)
      }),
      { ...runs, numRuns: 30 }
    )
  })
})

describe('account backup', () => {
  /** This device's slot, sealed, uploaded, downloaded and read back. */
  const throughSlot = (nonceByte: number) => {
    const plaintext = buildBackupPlaintext({
      deviceName: 'iPhone de Zoë 📱',
      platform: 'ios',
      now: Date.now(),
    })
    const key = deriveBackupKey(ACCOUNT_KEY)
    const blob = sealBackup(
      key,
      plaintext,
      ADDRESS,
      new Uint8Array(24).fill(nonceByte)
    )
    const opened = openBackup(key, blob, ADDRESS)
    expect(opened.deviceName).toBe(plaintext.deviceName)
    const read = readBackupPayload(opened, Date.now())
    if (!read.ok) throw new Error(`slot unreadable: ${read.problem}`)
    return read.payload
  }

  it("leaves this device's RevenueCat claim out", () => {
    setOwnAccountClaim({
      appUserId: '0f8e7c1a-5b2d-4e3f-9a6b-1c2d3e4f5a6b',
      entitled: true,
      claimedAt: 1,
    })
    try {
      const plaintext = buildBackupPlaintext({
        deviceName: 'iPhone',
        platform: 'ios',
        now: Date.now(),
      })
      expect(plaintext.payload).not.toHaveProperty('revenueCat')
    } finally {
      setOwnAccountClaim(null)
    }
  })

  it('a slot read back folds to every record it was built from', () => {
    fc.assert(
      fc.property(
        deviceArb,
        fc.integer({ min: 0, max: 255 }),
        (device, nonce) => {
          fillStores(device, {}, {})
          const before = deviceSnapshot(storesDevice())
          expect(before).toBe(deviceSnapshot(recordsOf(device)))
          const folded = foldBackupPayloads([throughSlot(nonce)])
          expect(folded).not.toBeNull()

          resetStores()
          replaceLocalWithBackup(folded!)
          expect(deviceSnapshot(storesDevice())).toBe(before)
        }
      ),
      runs
    )
  })

  it('restores the synced settings and profile', () => {
    fc.assert(
      fc.property(
        settingsArb,
        profileArb,
        stampArb,
        (settings, profile, stamp) => {
          fillStores(emptyDevice(), settings, profile)
          usePreferences.setState({
            preferenceUpdatedAt: Object.fromEntries(
              Object.keys(settings).map((key) => [key, stamp])
            ),
          })
          const folded = foldBackupPayloads([throughSlot(1)])!
          resetStores()
          replaceLocalWithBackup(folded)
          expect(settingsOf(Object.keys(settings))).toBe(
            canonicalJson(JSON.parse(JSON.stringify(settings)))
          )
          expect(profileOf(Object.keys(profile))).toBe(canonicalJson(profile))
        }
      ),
      runs
    )
  })
})
