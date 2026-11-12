import { describe, expect, it } from 'vitest'
import type { FuelUnit } from '@/types/mileage'
import {
  LITRES_PER_US_GALLON,
  displayToPricePerGallon,
  efficiencyUnit,
  fuelPriceUnit,
  pricePerGallonToDisplay,
} from '@/lib/mileage/units'

const unitFromNewerVersion = 'm3' as unknown as FuelUnit

describe('fuel units this version does not know', () => {
  it('are shown as priced by volume', () => {
    expect(fuelPriceUnit('mpgUS', unitFromNewerVersion)).toBe('gallon')
    expect(fuelPriceUnit('lPer100km', unitFromNewerVersion)).toBe('litre')
    expect(efficiencyUnit('kmPerL', unitFromNewerVersion)).toBe('kmPerL')
  })

  it('convert prices like a by-volume fuel', () => {
    expect(
      pricePerGallonToDisplay(
        LITRES_PER_US_GALLON,
        'kmPerL',
        unitFromNewerVersion
      )
    ).toBe(1)
    expect(displayToPricePerGallon(1, 'kmPerL', unitFromNewerVersion)).toBe(
      LITRES_PER_US_GALLON
    )
  })

  it('leave kWh fuels priced per kWh', () => {
    expect(fuelPriceUnit('lPer100km', 'kWh')).toBe('kWh')
    expect(pricePerGallonToDisplay(0.2, 'lPer100km', 'kWh')).toBe(0.2)
  })
})
