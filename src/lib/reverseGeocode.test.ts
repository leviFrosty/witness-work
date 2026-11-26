import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: 'ios' as 'ios' | 'android' | 'web',
  reverseGeocodeAsync: vi.fn(),
  request: vi.fn(),
  offline: false,
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platform
    },
  },
}))
vi.mock('expo-location', () => ({
  reverseGeocodeAsync: mocks.reverseGeocodeAsync,
}))
vi.mock('@/lib/http/request', () => ({
  request: mocks.request,
}))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => mocks.offline,
}))

import {
  addressFromGeocodedPlace,
  addressFromHereReverseGeocode,
  formatPinAddressParts,
  formatStreetLine,
  hasAddressContent,
  reverseGeocodeCoordinate,
} from '@/lib/reverseGeocode'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.platform = 'ios'
  mocks.offline = false
})

describe('formatStreetLine', () => {
  it('follows localized hint ordering for street-first and number-first countries', () => {
    expect(
      formatStreetLine({
        street: 'Hauptstraße',
        streetNumber: '12',
        hint: 'Hauptstraße 12, 10115 Berlin, Germany',
      })
    ).toBe('Hauptstraße 12')

    expect(
      formatStreetLine({
        street: 'Rue de la Paix',
        streetNumber: '12',
        hint: '12 Rue de la Paix, 75002 Paris, France',
      })
    ).toBe('12 Rue de la Paix')
  })

  it('uses country conventions when no hint matches', () => {
    expect(
      formatStreetLine({
        street: 'Rua Augusta',
        streetNumber: '500',
        isoCountryCode: 'BR',
      })
    ).toBe('Rua Augusta 500')

    expect(
      formatStreetLine({
        street: 'Main St',
        streetNumber: '123',
        isoCountryCode: 'US',
      })
    ).toBe('123 Main St')
  })
})

describe('addressFromGeocodedPlace', () => {
  it('extracts structured postal parts with international ordering', () => {
    expect(
      addressFromGeocodedPlace({
        street: 'Friedrichstraße',
        streetNumber: '43',
        city: 'Berlin',
        region: 'Berlin',
        postalCode: '10969',
        country: 'Germany',
        isoCountryCode: 'DE',
        name: 'Friedrichstraße 43',
        district: null,
        subregion: null,
        timezone: null,
        formattedAddress: null,
      })
    ).toEqual({
      address: {
        line1: 'Friedrichstraße 43',
        city: 'Berlin',
        state: 'Berlin',
        zip: '10969',
        country: 'Germany',
      },
      formattedAddress: 'Friedrichstraße 43, Berlin, Berlin 10969, Germany',
    })
  })

  it('returns null when placemark has no postal details', () => {
    expect(
      addressFromGeocodedPlace({
        street: null,
        streetNumber: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
        isoCountryCode: null,
        name: null,
        district: null,
        subregion: null,
        timezone: null,
        formattedAddress: null,
      })
    ).toBeNull()
  })
})

describe('addressFromHereReverseGeocode', () => {
  it('maps HERE reverse-geocode response into Address preserving label order', () => {
    expect(
      addressFromHereReverseGeocode({
        label: 'Bahnhofstrasse 10, 8001 Zürich, Schweiz',
        street: 'Bahnhofstrasse',
        houseNumber: '10',
        city: 'Zürich',
        state: 'Zürich',
        postalCode: '8001',
        countryName: 'Schweiz',
      })
    ).toEqual({
      address: {
        line1: 'Bahnhofstrasse 10',
        city: 'Zürich',
        state: 'Zürich',
        zip: '8001',
        country: 'Schweiz',
      },
      formattedAddress: 'Bahnhofstrasse 10, 8001 Zürich, Schweiz',
    })
  })
})

describe('formatPinAddressParts & hasAddressContent', () => {
  it('formats primary and secondary display lines without repeating line1', () => {
    expect(
      formatPinAddressParts({
        line1: '625 Sutter St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        country: 'United States',
      })
    ).toEqual({
      primary: '625 Sutter St',
      secondary: 'San Francisco, CA 94102, United States',
    })
  })

  it('detects empty vs populated addresses', () => {
    expect(hasAddressContent(undefined)).toBe(false)
    expect(hasAddressContent({ line1: '  ', city: '' })).toBe(false)
    expect(hasAddressContent({ zip: '75002' })).toBe(true)
  })
})

describe('reverseGeocodeCoordinate', () => {
  it('uses expo-location on iOS without calling the HTTP API', async () => {
    mocks.reverseGeocodeAsync.mockResolvedValueOnce([
      {
        street: 'Sutter St',
        streetNumber: '625',
        city: 'San Francisco',
        region: 'CA',
        postalCode: '94102',
        country: 'United States',
        isoCountryCode: 'US',
        name: '625 Sutter St',
        district: null,
        subregion: null,
        timezone: null,
        formattedAddress: null,
      },
    ])

    const result = await reverseGeocodeCoordinate({
      latitude: 37.7892,
      longitude: -122.41076,
    })

    expect(result?.address).toEqual({
      line1: '625 Sutter St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
      country: 'United States',
    })
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('uses ww-api on web', async () => {
    mocks.platform = 'web'
    mocks.request.mockResolvedValueOnce({
      data: {
        ok: true,
        address: {
          label: '12 Rue de la Paix, 75002 Paris, France',
          houseNumber: '12',
          street: 'Rue de la Paix',
          city: 'Paris',
          postalCode: '75002',
          countryName: 'France',
        },
      },
    })

    const result = await reverseGeocodeCoordinate({
      latitude: 48.86914,
      longitude: 2.33118,
    })

    expect(mocks.reverseGeocodeAsync).not.toHaveBeenCalled()
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining(
          '/places/v1/reverse-geocode?at=48.86914%2C2.33118'
        ),
      })
    )
    expect(result?.address).toEqual({
      line1: '12 Rue de la Paix',
      city: 'Paris',
      zip: '75002',
      country: 'France',
    })
  })

  it('falls back to ww-api on Android when native geocoder returns empty', async () => {
    mocks.platform = 'android'
    mocks.reverseGeocodeAsync.mockResolvedValueOnce([])
    mocks.request.mockResolvedValueOnce({
      data: {
        ok: true,
        address: {
          label: 'Rua Augusta 500, São Paulo, Brazil',
          houseNumber: '500',
          street: 'Rua Augusta',
          city: 'São Paulo',
          countryName: 'Brazil',
        },
      },
    })

    const result = await reverseGeocodeCoordinate({
      latitude: -23.553,
      longitude: -46.652,
    })

    expect(mocks.reverseGeocodeAsync).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledOnce()
    expect(result?.address.line1).toBe('Rua Augusta 500')
  })

  it('returns null gracefully when offline on web', async () => {
    mocks.platform = 'web'
    mocks.offline = true
    const result = await reverseGeocodeCoordinate({
      latitude: 48.86914,
      longitude: 2.33118,
    })
    expect(result).toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
