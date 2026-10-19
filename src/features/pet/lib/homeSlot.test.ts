import { describe, expect, it } from 'vitest'
import { petHomeSlot } from '@/features/pet/lib/homeSlot'
import { petRegionCode } from '@/features/pet/lib/region'

describe("Home's pet slot", () => {
  it('offers a pet until there is one or the User says Not now', () => {
    expect(
      petHomeSlot({ hasPet: false, promptDismissed: false, visible: true })
    ).toBe('prompt')
    expect(
      petHomeSlot({ hasPet: false, promptDismissed: true, visible: true })
    ).toBeNull()
  })

  it('shows the card once there is a pet', () => {
    expect(
      petHomeSlot({ hasPet: true, promptDismissed: true, visible: true })
    ).toBe('section')
    expect(
      petHomeSlot({ hasPet: true, promptDismissed: false, visible: true })
    ).toBe('section')
  })

  it('shows nothing while the section is hidden', () => {
    expect(
      petHomeSlot({ hasPet: true, promptDismissed: false, visible: false })
    ).toBeNull()
    expect(
      petHomeSlot({ hasPet: false, promptDismissed: false, visible: false })
    ).toBeNull()
  })
})

describe('pet window region', () => {
  it("prefers the Format Region's region, then the device's", () => {
    expect(petRegionCode('en-au', 'US')).toBe('AU')
    expect(petRegionCode('pt-br', null)).toBe('BR')
    expect(petRegionCode('de', 'za')).toBe('ZA')
    expect(petRegionCode(undefined, 'NZ')).toBe('NZ')
    expect(petRegionCode(undefined, null)).toBeNull()
  })
})
