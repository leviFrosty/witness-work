import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  getDeviceTypeAsync: async () => 1,
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new' }))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { buildPayload } from '@/app/sync/payload'
import { createBackupFile } from '@/lib/backupFile'
import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { sharedCar } from '@/lib/mileage/testing/sharedCars'

// A Shared Car lives in its space on ww-api; the User's iCloud, Google Drive,
// Cloud Sync, and backup files carry only their own mileage (protocol
// "Backups").

describe('Shared Cars on this device', () => {
  beforeEach(() => {
    useMileage.getState()._WARNING_forceDeleteMileage()
    useMileage
      .getState()
      .saveVehicle({ id: 'own-car', name: 'Own Civic', createdAt: 1 })
    useSharedCars.setState(useSharedCars.getInitialState(), true)
    useSharedCars.getState().saveSharedCar(
      sharedCar('space-1', {
        vehicles: [{ id: 'shared-car', name: 'Shared Mazda', createdAt: 1 }],
        trips: [
          {
            id: 'shared-trip',
            vehicleId: 'shared-car',
            date: '2026-10-01',
            distanceMiles: 5,
            note: 'Shared note',
            createdAt: 1,
          },
        ],
      })
    )
  })

  it('stay out of the sync payload', () => {
    const payload = JSON.stringify(buildPayload({ deviceId: 'device' }))
    expect(payload).toContain('Own Civic')
    for (const text of ['space-1', 'Shared Mazda', 'shared-trip'])
      expect(payload).not.toContain(text)
  })

  it('stay out of backup files', () => {
    const backup = JSON.stringify(createBackupFile())
    expect(backup).toContain('Own Civic')
    for (const text of ['space-1', 'Shared Mazda', 'shared-trip'])
      expect(backup).not.toContain(text)
  })
})
