import { buildPayload, parsePayload } from '@/app/sync/payload'
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  getDeviceTypeAsync: async () => 1,
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new' }))
import {
  BACKUP_FILE_VERSION,
  createBackupFile,
  isBackupFile,
} from '@/lib/backupFile'
import { restoreBackupFile } from '@/app/sync/backupFileRestore'
import useCategories from '@/stores/categories'
import useContacts from '@/stores/contactsStore'
import useMileage from '@/stores/mileage'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { isApplyingRemoteData } from '@/lib/remoteDataMutation'
import { storedDayKey } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies } from '@/types/timeEntry'
import {
  handleContactImport,
  importedVisitId,
} from '@/features/contacts/lib/contactImport'
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('expo-document-picker', () => ({}))
vi.mock('expo-file-system/legacy', () => ({}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

beforeEach(() => {
  useCategories.setState({ categories: [], deletedCategories: [] })
  useMileage.setState({ vehicles: [], trips: [] })
  useContacts.setState({
    contacts: [],
    deletedContacts: [],
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  })
  useConversations.setState({ conversations: [], deletedConversations: [] })
  useServiceReport.setState({
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
    deletedServiceReports: [],
  })
  usePreferences.setState({
    iCloudDeviceId: 'this-install',
    iCloudSyncIncludeImages: false,
    analyticsEnabled: false,
    dataProtectionMode: true,
    onboardingComplete: true,
  })
  useProfile.setState({ name: '', avatar: { type: 'none', value: '' } })
})

it('accepts a full serialized payload from the shipped stores', () => {
  expect(
    parsePayload(JSON.stringify(buildPayload({ deviceId: 'test' })))
  ).not.toBeNull()
})

describe('JSON backup file validation', () => {
  it('rejects JSON that holds no WitnessWork store', () => {
    expect(isBackupFile({ foo: 1 })).toBe(false)
    expect(isBackupFile([])).toBe(false)
    expect(isBackupFile([{ contactStore: {} }])).toBe(false)
    expect(isBackupFile({ contactStore: [] })).toBe(false)
    expect(isBackupFile({ preferencesStore: 'x' })).toBe(false)
    expect(isBackupFile(null)).toBe(false)
  })
  it('accepts an exported backup and old backups with only some stores', () => {
    expect(isBackupFile(JSON.parse(JSON.stringify(createBackupFile())))).toBe(
      true
    )
    expect(isBackupFile({ serviceReportStore: { serviceReports: {} } })).toBe(
      true
    )
  })
})

describe('JSON backup completeness and restore isolation', () => {
  it('round-trips categories and profile without copying identity or consent', () => {
    useCategories.setState({
      categories: [{ id: 'type', name: 'Type', isCredit: true, updatedAt: 1 }],
    })
    useProfile.setState({ name: 'Profile' })
    const backup = JSON.parse(JSON.stringify(createBackupFile()))
    expect(backup.preferencesStore.iCloudDeviceId).toBeUndefined()
    expect(backup.preferencesStore.analyticsEnabled).toBeUndefined()
    useCategories.setState({ categories: [] })
    useProfile.setState({ name: '' })
    backup.preferencesStore.iCloudDeviceId = 'another-install'
    backup.preferencesStore.iCloudSyncIncludeImages = true
    backup.preferencesStore.analyticsEnabled = true
    backup.preferencesStore.dataProtectionMode = false
    backup.preferencesStore.onboardingComplete = false
    restoreBackupFile(backup)
    expect(useCategories.getState().categories[0].name).toBe('Type')
    expect(useProfile.getState().name).toBe('Profile')
    expect(usePreferences.getState()).toMatchObject({
      iCloudDeviceId: 'this-install',
      iCloudSyncIncludeImages: false,
      analyticsEnabled: false,
      dataProtectionMode: true,
      onboardingComplete: true,
    })
  })
  it('preserves stores omitted by old backups and marks plan replacement as a restore', () => {
    useProfile.setState({ name: 'Keep' })
    useCategories.setState({
      categories: [{ id: 'keep', name: 'Keep', isCredit: false }],
    })
    useServiceReport.setState({
      dayPlans: [
        {
          id: 'linked',
          date: new Date(),
          minutes: 30,
          buddyShare: { from: 'buddy', shareId: 'share' },
        },
      ],
    })
    const restoreFlags: boolean[] = []
    const unsubscribe = useServiceReport.subscribe(() =>
      restoreFlags.push(isApplyingRemoteData())
    )
    restoreBackupFile({
      serviceReportStore: { dayPlans: [] },
      preferencesStore: {},
    })
    unsubscribe()
    expect(restoreFlags).toEqual([true])
    expect(isApplyingRemoteData()).toBe(false)
    expect(useProfile.getState().name).toBe('Keep')
    expect(useCategories.getState().categories).toHaveLength(1)
  })
  it('adds new visits and updates existing visits when replacing a shared contact', async () => {
    const contact = { id: 'c', name: 'Contact', createdAt: new Date() }
    useContacts.getState().addContact(contact)
    const previous = {
      id: 'existing',
      contact: { id: 'c' },
      date: new Date(),
      isBibleStudy: false,
      note: 'Old',
    }
    useConversations.getState().addConversation(previous)
    await handleContactImport(
      {
        type: 'witnesswork-contact',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        contact,
        conversations: [
          { ...previous, note: 'Changed' },
          { ...previous, id: 'new', note: 'New' },
        ],
      },
      contact,
      {
        ...useContacts.getState(),
        ...useConversations.getState(),
        getConversations: () => useConversations.getState().conversations,
        showToast: vi.fn(),
        navigate: vi.fn(),
      },
      true
    )
    expect(
      useConversations
        .getState()
        .conversations.map((visit) => [visit.id, visit.note])
    ).toEqual([
      ['existing', 'Changed'],
      [importedVisitId('c', 'new'), 'New'],
    ])
  })
})

const at = (day: string) => `${day}T12:00:00.000Z`
const visit = (id: string, followUp: Record<string, unknown>) => ({
  id,
  contact: { id: 'c' },
  date: at('2026-08-01'),
  isBibleStudy: false,
  followUp: { date: at('2026-08-08'), ...followUp },
})
const sameDayPlans = () => ({
  dayPlans: [{ id: 'cart', date: at('2026-10-09'), minutes: 60 }],
  recurringPlans: [
    {
      id: 'morning',
      startDate: at('2026-10-02'),
      minutes: 120,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    },
  ],
})

describe('JSON backups from older builds', () => {
  it('renames preferences a file from before 1.40 holds', () => {
    usePreferences.setState({ role: 'publisher', offDays: [] })
    restoreBackupFile({
      preferencesStore: { publisher: 'regularPioneer', excludedWeekdays: [0] },
    })
    expect(usePreferences.getState()).toMatchObject({
      role: 'regularPioneer',
      offDays: [0],
    })
  })

  it('strips the placeholder follow-up builds before 1.43 put on every Visit', () => {
    restoreBackupFile({
      preferencesStore: { lastAppVersion: '1.42.0' },
      conversationStore: {
        conversations: [
          visit('placeholder', { notifyMe: false }),
          visit('reminder', { notifyMe: true }),
        ],
      },
    })
    const [placeholder, reminder] = useConversations.getState().conversations
    expect(placeholder.followUp).toBeUndefined()
    expect(reminder.followUp?.notifyMe).toBe(true)
  })

  it('skips the recurring instance a Day Plan hid before 1.44', () => {
    restoreBackupFile({
      preferencesStore: { lastAppVersion: '1.43.0' },
      serviceReportStore: sameDayPlans(),
    })
    const { dayPlans, recurringPlans } = useServiceReport.getState()
    expect(recurringPlans[0].deletedDates?.map(storedDayKey)).toEqual([
      '2026-10-09',
    ])
    expect(dayPlans[0].date).toBeInstanceOf(Date)
  })

  it('leaves a 1.44 file alone', () => {
    restoreBackupFile({
      preferencesStore: {},
      conversationStore: {
        conversations: [visit('date-only', { notifyMe: false })],
      },
      serviceReportStore: sameDayPlans(),
    })
    expect(useConversations.getState().conversations[0].followUp).toBeDefined()
    expect(
      useServiceReport.getState().recurringPlans[0].deletedDates
    ).toBeUndefined()
  })

  it('round-trips a current backup unchanged', () => {
    usePreferences.setState({ role: 'regularPioneer', offDays: [1] })
    useConversations.setState({
      conversations: [visit('date-only', { notifyMe: false })] as never,
    })
    useServiceReport.setState(
      JSON.parse(JSON.stringify(sameDayPlans())) as never
    )
    const backup = JSON.parse(JSON.stringify(createBackupFile()))
    expect(backup).toMatchObject({
      version: 1,
      conversationStore: { explicitFollowUps: true },
      serviceReportStore: { additivePlans: true },
    })
    usePreferences.setState({ role: 'publisher', offDays: [] })
    useConversations.setState({ conversations: [] })
    useServiceReport.setState({ dayPlans: [], recurringPlans: [] })
    expect(restoreBackupFile(backup)).toEqual({ ok: true, droppedRecords: 0 })
    expect(JSON.parse(JSON.stringify(createBackupFile()))).toEqual(backup)
  })

  it("keeps a shared Contact's visit marked as received", () => {
    useConversations.setState({
      conversations: [
        { ...visit('received', { notifyMe: false }), receivedAt: 1 },
      ] as never,
    })
    const backup = JSON.parse(JSON.stringify(createBackupFile()))
    useConversations.setState({ conversations: [] })
    expect(restoreBackupFile(backup)).toEqual({ ok: true, droppedRecords: 0 })
    expect(useConversations.getState().conversations[0].receivedAt).toBe(1)
  })

  it('rejects a file whose records are the wrong shape', () => {
    useContacts.setState({ contacts: [{ id: 'keep' }] as never })
    expect(restoreBackupFile({ contactStore: { contacts: 'nope' } })).toEqual({
      ok: false,
      problem: 'unreadable',
    })
    expect(useContacts.getState().contacts).toEqual([{ id: 'keep' }])
  })
})

describe('JSON backups this build cannot fully read', () => {
  const fileWith = (version: number | undefined) => ({
    ...(version === undefined ? {} : { version }),
    contactStore: {
      contacts: [
        { id: 'c1', name: 'Ann', createdAt: '2026-01-01T00:00:00.000Z' },
        {
          id: 'c2',
          name: 'Bob',
          createdAt: '2026-01-01T00:00:00.000Z',
          gender: 'unknown-to-this-build',
        },
      ],
      deletedContacts: [],
    },
  })

  it('refuses a file from a newer build and changes nothing', () => {
    useContacts.setState({ contacts: [{ id: 'keep' }] as never })
    expect(restoreBackupFile(fileWith(BACKUP_FILE_VERSION + 1))).toEqual({
      ok: false,
      problem: 'newer',
    })
    expect(useContacts.getState().contacts).toEqual([{ id: 'keep' }])
  })

  it.each([BACKUP_FILE_VERSION, undefined])(
    'restores the rest of a version %s file and counts what it dropped',
    (version) => {
      expect(restoreBackupFile(fileWith(version))).toEqual({
        ok: true,
        droppedRecords: 1,
      })
      expect(useContacts.getState().contacts.map(({ id }) => id)).toEqual([
        'c1',
      ])
    }
  )
})

describe('JSON backups from before id-keyed custom fields', () => {
  const legacyFile = () => ({
    preferencesStore: {
      lastAppVersion: '1.30.0',
      customContactFields: ['Language'],
    },
    contactStore: {
      contacts: [
        {
          id: 'c1',
          name: 'Ann',
          createdAt: '2025-01-01T00:00:00.000Z',
          customFields: { Language: 'Spanish' },
        },
      ],
      deletedContacts: [],
    },
  })

  it('restores label-keyed values under definitions that show them', () => {
    usePreferences.setState({ hasMigratedCustomFieldsToIds: true })
    expect(restoreBackupFile(legacyFile())).toEqual({
      ok: true,
      droppedRecords: 0,
    })
    const { contacts, customFieldDefs } = useContacts.getState()
    const [language] = customFieldDefs
    expect(language.label).toBe('Language')
    expect(contacts[0].customFields).toEqual({ [language.id]: 'Spanish' })
  })

  it("keeps the device's own definitions", () => {
    useContacts.setState({
      customFieldDefs: [
        { id: 'local', label: 'Floor', order: 0, createdAt: 1, updatedAt: 1 },
      ],
    })
    restoreBackupFile(legacyFile())
    expect(
      useContacts.getState().customFieldDefs.map((def) => def.label)
    ).toEqual(['Floor', 'Language'])
  })

  it('files values under a local definition with the same label', () => {
    useContacts.setState({
      customFieldDefs: [
        { id: 'mine', label: 'Language', order: 0, createdAt: 1, updatedAt: 1 },
      ],
    })
    restoreBackupFile(legacyFile())
    const { contacts, customFieldDefs } = useContacts.getState()
    expect(customFieldDefs.map((def) => def.id)).toEqual(['mine'])
    expect(contacts[0].customFields).toEqual({ mine: 'Spanish' })
  })

  it('leaves a current file without legacy labels alone', () => {
    restoreBackupFile({
      preferencesStore: {},
      contactStore: {
        contacts: [{ ...legacyFile().contactStore.contacts[0] }],
        customFieldDefs: [],
      },
    })
    expect(useContacts.getState().contacts[0].customFields).toEqual({
      Language: 'Spanish',
    })
  })
})

describe('JSON backup categories and mileage', () => {
  const car = { id: 'car', name: 'Car', createdAt: 1, updatedAt: 1 }
  const trip = {
    id: 'trip',
    vehicleId: 'car',
    date: '2026-10-01',
    distanceMiles: 12,
    createdAt: 1,
    updatedAt: 1,
  }

  it('rejects a file whose category or mileage lists are not lists', () => {
    const keep = { id: 'keep', name: 'Keep', isCredit: false }
    useCategories.setState({ categories: [keep] })
    useMileage.setState({ vehicles: [car] })
    expect(
      restoreBackupFile({
        contactStore: { contacts: [], deletedContacts: [] },
        categoryStore: { categories: { a: 1 } },
        mileageStore: { vehicles: [null], trips: 'x' },
      })
    ).toEqual({ ok: false, problem: 'unreadable' })
    expect(useCategories.getState().categories).toEqual([keep])
    expect(useMileage.getState().vehicles).toEqual([car])
  })

  it('drops unreadable categories and trips, keeping the rest', () => {
    expect(
      restoreBackupFile({
        categoryStore: {
          categories: [null, {}, { id: 'type', name: 'Type', isCredit: true }],
        },
        mileageStore: {
          vehicles: [car, null],
          trips: [trip, { ...trip, id: 'bad', distanceMiles: 'far' }],
        },
      })
    ).toEqual({ ok: true, droppedRecords: 4 })
    expect(useCategories.getState().categories.map((c) => c.id)).toEqual([
      'type',
    ])
    expect(useMileage.getState().vehicles.map((v) => v.id)).toEqual(['car'])
    expect(useMileage.getState().trips.map((t) => t.id)).toEqual(['trip'])
  })

  it('leaves mileage lists a file lacks alone', () => {
    useMileage.setState({ vehicles: [car], trips: [trip] })
    restoreBackupFile({ mileageStore: { trips: [] } })
    expect(useMileage.getState().vehicles).toEqual([car])
    expect(useMileage.getState().trips).toEqual([])
  })
})
