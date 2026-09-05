import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({ DeviceType: { TABLET: 2 }, deviceType: 1 }))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (k: string) => k },
}))

import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'

import { useMileage, initialMileageState } from '@/stores/mileage'
import { derivePublisherCapabilities } from '@/lib/publisherCapabilities'

const capabilities = () => {
  const preferences = usePreferences.getState()
  return derivePublisherCapabilities({
    ...preferences,
    publisher: preferences.role,
  })
}

describe('mileage preference transitions', () => {
  beforeEach(() => {
    usePreferences.setState({ ...PREFERENCE_DEFAULTS, preferenceUpdatedAt: {} })
    useMileage.setState(initialMileageState)
  })

  it('follows Publisher changes only while the choice is Default', () => {
    const preferences = usePreferences.getState()
    preferences.setRole('specialPioneer')
    expect(capabilities().tracksMileage).toBe(true)
    preferences.setRole('publisher')
    expect(capabilities().tracksMileage).toBe(false)
    preferences.setUserSpecifiedMileageTracking(true)
    preferences.setRole('regularPioneer')
    expect(capabilities().tracksMileage).toBe(true)
    preferences.setUserSpecifiedMileageTracking(false)
    preferences.setRole('circuitOverseer')
    expect(capabilities().tracksMileage).toBe(false)
    preferences.setUserSpecifiedMileageTracking('default')
    expect(capabilities().tracksMileage).toBe(true)
  })

  it('preserves history, vehicles, and remembered choices while disabled', () => {
    const preferences = usePreferences.getState()
    useMileage.getState().addVehicle({
      id: 'car',
      name: 'Car',
      avatar: { type: 'emoji', value: '🚗' },
      avatarBackground: '',
      createdAt: 1,
      updatedAt: 1,
    })
    useMileage.getState().addEntry({
      id: 'trip',
      vehicleId: 'car',
      date: '2020-01-01',
      mode: 'distance',
      status: 'completed',
      distanceMeters: 1000,
      createdAt: 1,
      updatedAt: 1,
    })
    preferences.setMileageLastVehicleId('car')
    preferences.setMileageLastEntryMode('odometer')
    preferences.setMileageDistanceUnit('mi')
    const vehicles = useMileage.getState().vehicles
    const entries = useMileage.getState().entries
    preferences.setUserSpecifiedMileageTracking(false)
    preferences.setRole('specialPioneer')
    preferences.setUserSpecifiedMileageTracking(true)
    expect(useMileage.getState().vehicles).toBe(vehicles)
    expect(useMileage.getState().entries).toBe(entries)
    expect(usePreferences.getState()).toMatchObject({
      mileageLastVehicleId: 'car',
      mileageLastEntryMode: 'odometer',
      mileageDistanceUnit: 'mi',
    })
  })

  it('stamps the independent mileage preferences for sync', () => {
    const preferences = usePreferences.getState()
    preferences.setUserSpecifiedMileageTracking(true)
    preferences.setMileageSubmissionMethod('share')
    preferences.setMileageDistanceUnit('km')
    const updated = usePreferences.getState()
    expect(
      updated.preferenceUpdatedAt.userSpecifiedMileageTracking
    ).toBeGreaterThan(0)
    expect(updated.preferenceUpdatedAt.mileageSubmissionMethod).toBeGreaterThan(
      0
    )
    expect(updated.preferenceUpdatedAt.mileageDistanceUnit).toBeGreaterThan(0)
  })
})
