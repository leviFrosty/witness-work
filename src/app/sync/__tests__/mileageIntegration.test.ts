import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyMileageData } from '@/lib/mileagePersistence'
import { MileageData } from '@/types/mileage'

const state = vi.hoisted(() => {
  const mileage = {
    vehicles: [],
    categories: [],
    entries: [],
    deletedVehicles: [],
    deletedCategories: [],
    deletedEntries: [],
  } as MileageData
  const store = (values: object) => ({
    getState: () => values,
    setState: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  })
  return {
    mileage,
    mileageStore: {
      getState: () => mileage,
      setState: vi.fn((data: MileageData) => Object.assign(mileage, data)),
      subscribe: vi.fn(() => vi.fn()),
    },
    contacts: store({ contacts: [], deletedContacts: [], customFieldDefs: [] }),
    conversations: store({ conversations: [], deletedConversations: [] }),
    reports: store({
      serviceReports: {},
      dayPlans: [],
      recurringPlans: [],
      deletedServiceReports: [],
    }),
    categories: store({ categories: [], deletedCategories: [] }),
    preferences: store({
      preferenceUpdatedAt: {},
      iCloudSyncIncludeImages: false,
    }),
    profile: store({ profileUpdatedAt: {} }),
  }
})
vi.mock('@/stores/mileage', () => ({ default: state.mileageStore }))
vi.mock('@/stores/contactsStore', () => ({ default: state.contacts }))
vi.mock('@/stores/conversationStore', () => ({ default: state.conversations }))
vi.mock('@/stores/serviceReport', () => ({ default: state.reports }))
vi.mock('@/stores/categories', () => ({ default: state.categories }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: state.preferences,
  NON_SYNCABLE_PREFERENCE_KEYS: new Set(),
}))
vi.mock('@/stores/profile', () => ({
  useProfile: state.profile,
  NON_SYNCABLE_PROFILE_KEYS: new Set(),
}))
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}))
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
}))
vi.mock('expo-device', () => ({}))
vi.mock('@sentry/react-native', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}))
vi.mock('../../../../modules/icloud-bridge', () => ({}))
vi.mock('@/features/supporter/stores/supporter', () => ({
  useSupporter: { getState: () => ({ isSupporter: false }) },
}))
vi.mock('@/lib/account', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/app/sync/imageSync', () => ({}))
vi.mock('@/app/sync/imageSources', () => ({}))

import { buildPayload, parsePayload } from '@/app/sync/payload'
import {
  foldRemotePayloads,
  hasMeaningfulLocalData,
  replaceLocalWithRemote,
} from '@/app/sync/iCloudSync'

beforeEach(() => {
  Object.assign(state.mileage, emptyMileageData())
  vi.clearAllMocks()
})

const addVehicle = () =>
  state.mileage.vehicles.push({
    id: 'car',
    name: 'Test car',
    avatar: { type: 'emoji', value: '🚗' },
    avatarBackground: '',
    createdAt: 1,
    updatedAt: 1,
  })

describe('mileage backup/sync integration paths', () => {
  it('builds and parses complete mileage wire data, including an unfinished trip', () => {
    addVehicle()
    state.mileage.entries.push({
      id: 'trip',
      vehicleId: 'car',
      date: '2026-09-04',
      mode: 'odometer',
      status: 'inProgress',
      startOdometerMeters: 1000,
      createdAt: 2,
      updatedAt: 2,
    })
    const payload = buildPayload({ deviceId: 'test' })
    expect(payload.mileageStore).toEqual(state.mileage)
    expect(parsePayload(JSON.stringify(payload))?.mileageStore).toEqual(
      state.mileage
    )
    expect(
      parsePayload(
        JSON.stringify({
          ...payload,
          mileageStore: { ...state.mileage, vehicles: [] },
        })
      )
    ).toBeNull()
  })

  it('treats mileage-only and deletion-only devices as meaningful local data', () => {
    expect(hasMeaningfulLocalData()).toBe(false)
    addVehicle()
    expect(hasMeaningfulLocalData()).toBe(true)
    state.mileage.vehicles = []
    state.mileage.deletedEntries = [{ id: 'trip', deletedAt: Date.now() }]
    expect(hasMeaningfulLocalData()).toBe(true)
  })

  it('preserves local mileage when replacing from an old payload, including folded old peers', () => {
    const old = buildPayload({ deviceId: 'old' })
    delete old.mileageStore
    addVehicle()
    const folded = foldRemotePayloads([old, { ...old, deviceId: 'other-old' }])!
    expect(folded.mileageStore).toBeUndefined()
    replaceLocalWithRemote(folded)
    expect(state.mileage.vehicles).toHaveLength(1)
    expect(state.mileageStore.setState).not.toHaveBeenCalled()
  })

  it('honors explicit mileage replacement and folds new and old peers without dropping mileage', () => {
    const old = buildPayload({ deviceId: 'old' })
    delete old.mileageStore
    addVehicle()
    const modern = buildPayload({ deviceId: 'new' })
    expect(
      foldRemotePayloads([old, modern])?.mileageStore?.vehicles
    ).toHaveLength(1)
    expect(
      foldRemotePayloads([modern, old])?.mileageStore?.vehicles
    ).toHaveLength(1)
    replaceLocalWithRemote({ ...old, mileageStore: emptyMileageData() })
    expect(state.mileage.vehicles).toEqual([])
  })
})
