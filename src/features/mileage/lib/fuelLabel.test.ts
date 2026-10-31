import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})

import { buildMileageView } from '@/lib/mileage/view'
import { fuelCarName, fuelLabel } from '@/features/mileage/lib/fuelLabel'
import { sharedCar } from '@/lib/mileage/testing/sharedCars'
import type { MileageSnapshot } from '@/types/mileage'

const own: MileageSnapshot = {
  vehicles: [{ id: 'civic', name: 'Civic', createdAt: 1 }],
  fuels: [{ id: 'gas', name: 'Gasoline', createdAt: 1 }],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
}

describe('fuels in Mileage Settings', () => {
  it('name a Shared Car’s fuels with their car, after the User’s own', () => {
    const view = buildMileageView(own, {
      van: sharedCar('van', {
        vehicles: [{ id: 'van-car', name: 'Family Minivan', createdAt: 2 }],
        fuels: [{ id: 'van-gas', name: 'Gasoline', createdAt: 2 }],
      }),
      mazda: sharedCar('mazda', {
        vehicles: [{ id: 'mazda-car', name: 'Mazda CX-5', createdAt: 3 }],
        fuels: [{ id: 'mazda-diesel', name: 'Diesel', createdAt: 3 }],
      }),
    })
    expect(view.fuels.map((fuel) => fuelLabel(fuel, view))).toEqual([
      'Gasoline',
      'Gasoline · Family Minivan',
      'Diesel · Mazda CX-5',
    ])
  })

  it('stay as they are without Shared Cars', () => {
    const view = buildMileageView(own, {})
    expect(view.fuels.map((fuel) => fuelLabel(fuel, view))).toEqual([
      'Gasoline',
    ])
  })
})

describe('a Shared Car’s fuel form', () => {
  it('names the car whose people all use the fuel', () => {
    const view = buildMileageView(own, {
      van: sharedCar('van', {
        vehicles: [{ id: 'van-car', name: 'Family Minivan', createdAt: 2 }],
        fuels: [{ id: 'van-gas', name: 'Gasoline', createdAt: 2 }],
      }),
    })
    expect(fuelCarName({ id: 'van-gas' }, view)).toBe('Family Minivan')
    expect(fuelCarName({ id: 'gas' }, view)).toBeUndefined()
  })
})
