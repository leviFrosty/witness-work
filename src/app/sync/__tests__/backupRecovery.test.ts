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
import { createBackupFile, restoreBackupFile } from '@/lib/backupFile'
import useCategories from '@/stores/categories'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { isApplyingRemoteData } from '@/lib/remoteDataMutation'
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
