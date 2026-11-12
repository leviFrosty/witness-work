import { describe, expect, it } from 'vitest'
import {
  territoryMapsUrl,
  territoryQrValue,
} from '@/features/territories/lib/territoryUrls'

const coordinate = { latitude: -1.2921, longitude: 36.8219 }

describe('territoryMapsUrl', () => {
  it("opens the pin in the User's navigation app", () => {
    expect(territoryMapsUrl({ coordinate }, 'apple', 'ios')).toBe(
      'https://maps.apple.com/?q=-1.2921%2C36.8219'
    )
    expect(territoryMapsUrl({ coordinate }, 'google', 'ios')).toBe(
      'https://www.google.com/maps/search/?api=1&query=-1.2921%2C36.8219'
    )
    expect(territoryMapsUrl({ coordinate }, 'waze', 'ios')).toBe(
      'https://waze.com/ul?ll=-1.2921%2C36.8219&navigate=yes'
    )
  })

  it('uses Google Maps on Android when Apple Maps is the saved choice', () => {
    expect(territoryMapsUrl({ coordinate }, 'apple', 'android')).toBe(
      'https://www.google.com/maps/search/?api=1&query=-1.2921%2C36.8219'
    )
  })

  it('falls back to the territory link when there is no pin', () => {
    expect(
      territoryMapsUrl({ link: 'https://example.com/map.pdf' }, 'apple', 'ios')
    ).toBe('https://example.com/map.pdf')
    expect(territoryMapsUrl({}, 'apple', 'ios')).toBeUndefined()
  })
})

describe('territoryQrValue', () => {
  it("shows the territory's own link when it has one", () => {
    expect(
      territoryQrValue({ coordinate, link: 'https://maps.app.goo.gl/abc' })
    ).toBe('https://maps.app.goo.gl/abc')
  })

  it('makes a map link from the pin otherwise', () => {
    expect(territoryQrValue({ coordinate })).toBe(
      'https://www.google.com/maps/search/?api=1&query=-1.2921,36.8219'
    )
    expect(territoryQrValue({})).toBeUndefined()
  })
})
