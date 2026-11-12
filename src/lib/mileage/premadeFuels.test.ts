import { describe, expect, it } from 'vitest'
import {
  PREMADE_FUEL_PRICES,
  PREMADE_FUEL_STAMP,
  ensurePremadeFuels,
  hasOwnMileageRecords,
  premadeFuelId,
  premadeFuelPrice,
  premadeFuelPriceId,
  type PremadeFuelContext,
} from '@/lib/mileage/premadeFuels'
import {
  mergeMileageRecords,
  removeMileageRecords,
  matchFuel,
  upsertMileageRecord,
} from '@/lib/mileage/records'
import { estimateTrip, buildMileageIndex } from '@/lib/mileage/calc'
import {
  LITRES_PER_US_GALLON,
  economyToMpg,
  mpgToEconomy,
  pricePerGallonToDisplay,
} from '@/lib/mileage/units'
import type { MileageSnapshot } from '@/types/mileage'

const empty = (): MileageSnapshot => ({
  vehicles: [],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
})

const names = { gasoline: 'Gasoline', diesel: 'Diesel', electric: 'Electric' }
const us: PremadeFuelContext = { region: 'US', currency: 'USD', names }
const germany: PremadeFuelContext = { region: 'DE', currency: 'EUR', names }

const seeded = (state = empty(), context = us): MileageSnapshot => ({
  ...state,
  ...ensurePremadeFuels(state, context),
})

const gasoline = premadeFuelId('gasoline')
const diesel = premadeFuelId('diesel')
const electric = premadeFuelId('electric')

describe('premade fuel prices', () => {
  it('prices US fuel per gallon and electricity per kWh', () => {
    expect(premadeFuelPrice('gasoline', 'US', 'USD')).toBe(3.86)
    expect(premadeFuelPrice('diesel', 'US', 'USD')).toBe(5.13)
    expect(premadeFuelPrice('electric', 'US', 'USD')).toBe(0.182)
  })

  it('stores a per-litre price so it reads back per litre', () => {
    const stored = premadeFuelPrice('gasoline', 'de', 'eur')!
    expect(stored).toBeCloseTo(2.06 * LITRES_PER_US_GALLON, 10)
    expect(pricePerGallonToDisplay(stored, 'lPer100km')).toBeCloseTo(2.06, 10)
    expect(premadeFuelPrice('electric', 'DE', 'EUR')).toBe(0.362)
  })

  it('has no price for an unlisted region or another currency', () => {
    expect(premadeFuelPrice('gasoline', 'NG', 'NGN')).toBeUndefined()
    expect(premadeFuelPrice('gasoline', undefined, 'USD')).toBeUndefined()
    expect(premadeFuelPrice('gasoline', 'US', 'EUR')).toBeUndefined()
  })

  it('reads a missing currency as dollars, as the web shows money', () => {
    expect(premadeFuelPrice('gasoline', 'US', null)).toBe(3.86)
    expect(premadeFuelPrice('electric', 'US', undefined)).toBe(0.182)
    expect(premadeFuelPrice('gasoline', 'DE', null)).toBeUndefined()
  })

  it('lists only positive prices under ISO codes', () => {
    for (const [region, prices] of Object.entries(PREMADE_FUEL_PRICES)) {
      expect(region).toMatch(/^[A-Z]{2}$/)
      expect(prices.currency).toMatch(/^[A-Z]{3}$/)
      for (const value of [prices.gasoline, prices.diesel, prices.electricity])
        expect(value).toBeGreaterThan(0)
    }
  })
})

describe('ensurePremadeFuels', () => {
  it('gives a fresh install the three fuels with prices', () => {
    const state = seeded()
    expect(state.fuels.map((fuel) => fuel.name)).toEqual([
      'Gasoline',
      'Diesel',
      'Electric',
    ])
    expect(state.fuels.map((fuel) => fuel.unit)).toEqual([
      undefined,
      undefined,
      'kWh',
    ])
    expect(state.fuelPrices.map((p) => [p.fuelId, p.pricePerGallon])).toEqual([
      [gasoline, 3.86],
      [diesel, 5.13],
      [electric, 0.182],
    ])
    expect(state.deletedMileageRecords).toEqual([])
  })

  it('changes nothing the second time', () => {
    expect(ensurePremadeFuels(seeded(), us)).toBeNull()
  })

  it('adds the fuels without prices where the region has none', () => {
    const state = seeded(empty(), { region: 'NG', currency: 'NGN', names })
    expect(state.fuels).toHaveLength(3)
    expect(state.fuelPrices).toEqual([])
  })

  it('reads as no data of the User’s own until something is touched', () => {
    const state = seeded()
    expect(hasOwnMileageRecords(empty())).toBe(false)
    expect(hasOwnMileageRecords(state)).toBe(false)
    const renamed = {
      ...state,
      ...upsertMileageRecord(state, 'fuels', {
        ...state.fuels[0],
        name: 'Premium',
      }),
    }
    expect(hasOwnMileageRecords(renamed)).toBe(true)
  })

  it('keeps a deleted premade fuel deleted', () => {
    const state = seeded()
    const afterDelete = {
      ...state,
      ...removeMileageRecords(state, matchFuel(diesel)).changes,
    }
    expect(afterDelete.fuels.map((fuel) => fuel.id)).toEqual([
      gasoline,
      electric,
    ])
    expect(ensurePremadeFuels(afterDelete, us)).toBeNull()
  })

  it('leaves a renamed or repriced premade fuel as the User left it', () => {
    const state = seeded()
    const renamed = {
      ...state,
      ...upsertMileageRecord(state, 'fuels', {
        ...state.fuels[0],
        name: 'Regular',
      }),
    }
    expect(ensurePremadeFuels(renamed, us)).toBeNull()
    expect(renamed.fuels[0].name).toBe('Regular')
  })

  describe('for someone who already has fuels', () => {
    const existing = (): MileageSnapshot => ({
      ...empty(),
      vehicles: [{ id: 'car', name: 'Civic', createdAt: 5 }],
      fuels: [{ id: 'mine', name: ' gasoline ', createdAt: 5, updatedAt: 5 }],
      fuelPrices: [
        {
          id: 'mine-price',
          fuelId: 'mine',
          effectiveFrom: '2025-06-01',
          pricePerGallon: 3.1,
          updatedAt: 5,
        },
      ],
      vehicleSetups: [
        {
          id: 'setup',
          vehicleId: 'car',
          effectiveFrom: '2025-06-01',
          fuelId: 'mine',
          milesPerGallon: 30,
        },
      ],
    })

    it('adds only the fuels they don’t have, after none of their own', () => {
      const state = seeded(existing())
      expect(state.fuels.map((fuel) => fuel.id)).toEqual([
        diesel,
        electric,
        'mine',
      ])
      expect(state.fuelPrices.map((price) => price.id)).toEqual([
        'mine-price',
        premadeFuelPriceId('diesel'),
        premadeFuelPriceId('electric'),
      ])
      expect(state.vehicleSetups).toEqual(existing().vehicleSetups)
    })

    it('matches the names people use, like Gas or Petrol', () => {
      for (const name of ['Gas', 'PETROL', 'Unleaded', 'Regular']) {
        const state = seeded({
          ...empty(),
          fuels: [{ id: 'mine', name, createdAt: 5 }],
        })
        expect(state.fuels.some((fuel) => fuel.id === gasoline)).toBe(false)
      }
    })

    it('doesn’t bring Gasoline in when they later rename their own', () => {
      const state = seeded(existing())
      const renamed = {
        ...state,
        fuels: state.fuels.map((fuel) =>
          fuel.id === 'mine' ? { ...fuel, name: 'Premium', updatedAt: 9 } : fuel
        ),
      }
      expect(ensurePremadeFuels(renamed, us)).toBeNull()
    })

    it('takes back an untouched premade fuel that a sync made a duplicate', () => {
      const merged: MileageSnapshot = {
        ...seeded(),
        fuels: [...seeded().fuels, ...existing().fuels],
      }
      const state = { ...merged, ...ensurePremadeFuels(merged, us) }
      expect(state.fuels.map((fuel) => fuel.id)).toEqual([
        diesel,
        electric,
        'mine',
      ])
      expect(state.fuelPrices.some((price) => price.fuelId === gasoline)).toBe(
        false
      )
      expect(ensurePremadeFuels(state, us)).toBeNull()
    })

    it('keeps a duplicate-named premade fuel a car already uses', () => {
      const merged: MileageSnapshot = {
        ...seeded(),
        fuels: [...seeded().fuels, ...existing().fuels],
        vehicleSetups: [
          {
            id: 'setup',
            vehicleId: 'car',
            effectiveFrom: '2026-01-01',
            fuelId: gasoline,
          },
        ],
      }
      expect(ensurePremadeFuels(merged, us)).toBeNull()
    })
  })

  describe('across devices and restores', () => {
    const mergeInto = (local: MileageSnapshot, remote: MileageSnapshot) => {
      const merged = { ...local, ...mergeMileageRecords(local, remote) }
      return { ...merged, ...ensurePremadeFuels(merged, us) }
    }

    it('holds one of each after two devices each make them', () => {
      const state = mergeInto(seeded(), seeded(empty(), germany))
      expect(state.fuels.map((fuel) => fuel.id)).toEqual([
        gasoline,
        diesel,
        electric,
      ])
      expect(state.fuelPrices).toHaveLength(3)
    })

    it('takes the other device’s edit over its own fresh copy', () => {
      const other = seeded()
      const edited = {
        ...other,
        ...upsertMileageRecord(other, 'fuelPrices', {
          ...other.fuelPrices[0],
          pricePerGallon: 4.5,
        }),
      }
      const state = mergeInto(seeded(), edited)
      expect(
        state.fuelPrices.find((p) => p.fuelId === gasoline)?.pricePerGallon
      ).toBe(4.5)
    })

    it('doesn’t bring back a fuel deleted on another device', () => {
      const other = seeded()
      const deleted = {
        ...other,
        ...removeMileageRecords(other, matchFuel(electric)).changes,
      }
      const state = mergeInto(seeded(), deleted)
      expect(state.fuels.map((fuel) => fuel.id)).toEqual([gasoline, diesel])
      expect(state.fuelPrices.map((price) => price.fuelId)).toEqual([
        gasoline,
        diesel,
      ])
    })

    it('adds them to a backup restored from before premade fuels', () => {
      const backup: MileageSnapshot = {
        ...empty(),
        fuels: [{ id: 'mine', name: 'E85', createdAt: 5 }],
      }
      expect(seeded(backup).fuels.map((fuel) => fuel.id)).toEqual([
        gasoline,
        diesel,
        electric,
        'mine',
      ])
    })

    it('respects the deletions a restored backup carries', () => {
      const before = seeded()
      const backup = {
        ...before,
        ...removeMileageRecords(before, matchFuel(gasoline)).changes,
      }
      expect(ensurePremadeFuels(backup, us)).toBeNull()
    })
  })
})

describe('electric cost and units', () => {
  it('estimates cost from miles per kWh and the price per kWh', () => {
    const state: MileageSnapshot = {
      ...seeded(),
      vehicleSetups: [
        {
          id: 'setup',
          vehicleId: 'ev',
          effectiveFrom: '2026-01-01',
          fuelId: electric,
          milesPerGallon: 3.5,
        },
      ],
    }
    const index = buildMileageIndex(state.vehicleSetups, state.fuelPrices)
    const { cost } = estimateTrip(
      { vehicleId: 'ev', date: '2026-11-09', distanceMiles: 70 },
      index
    )
    expect(cost).toBeCloseTo(3.64, 10)
  })

  it('reads efficiency per kWh in each fuel economy choice', () => {
    expect(mpgToEconomy(3.5, 'mpgUS', 'kWh')).toBe(3.5)
    expect(mpgToEconomy(3.5, 'mpgUK', 'kWh')).toBe(3.5)
    expect(mpgToEconomy(3.5, 'kmPerL', 'kWh')).toBeCloseTo(5.6327, 4)
    expect(mpgToEconomy(3.5, 'lPer100km', 'kWh')).toBeCloseTo(17.7535, 4)
  })

  it('round-trips efficiency and leaves the kWh price alone', () => {
    for (const unit of ['mpgUS', 'mpgUK', 'lPer100km', 'kmPerL'] as const) {
      expect(
        economyToMpg(mpgToEconomy(3.5, unit, 'kWh'), unit, 'kWh')
      ).toBeCloseTo(3.5, 10)
      expect(pricePerGallonToDisplay(0.182, unit, 'kWh')).toBe(0.182)
    }
  })

  it('PREMADE_FUEL_STAMP is older than any real write', () => {
    expect(PREMADE_FUEL_STAMP).toBe(1)
  })
})
