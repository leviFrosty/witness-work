import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  version: 0,
  autocomplete: vi.fn(async () => [{ id: 'a', title: 'A', subtitle: '' }]),
  resolve: vi.fn(async () => null),
  get: vi.fn(),
}))

vi.mock('../../modules/place-search', () => ({
  get isAvailable() {
    return native.version >= 1
  },
  get supportsAddressScope() {
    return native.version >= 2
  },
  autocomplete: native.autocomplete,
  resolve: native.resolve,
}))
vi.mock('axios', () => ({ default: { get: native.get } }))
vi.mock('@/constants/apis', () => ({
  default: { autocomplete: 'https://api.test/autocomplete' },
}))

import {
  appleMapsUrl,
  formatPlanLocation,
  placeSearchProvider,
  resolvePlace,
  searchPlaces,
} from '@/lib/placeSearch'

beforeEach(() => {
  vi.clearAllMocks()
  native.version = 0
})

describe('placeSearchProvider', () => {
  it.each([
    [0, 'address', 'here'],
    [0, 'all', undefined],
    [1, 'address', 'here'],
    [1, 'all', 'mapkit'],
    [2, 'address', 'mapkit'],
    [2, 'all', 'mapkit'],
  ] as const)(
    'native version %i searches %s with %s',
    (version, scope, provider) => {
      native.version = version
      expect(placeSearchProvider(scope)).toBe(provider)
    }
  )
})

describe('searchPlaces', () => {
  it('asks MapKit for addresses only on a version 2 binary', async () => {
    native.version = 2
    const near = { latitude: 1, longitude: 2 }
    await searchPlaces('1 Example', near, 'address')
    expect(native.autocomplete).toHaveBeenCalledWith(
      '1 Example',
      near,
      'address'
    )
    expect(native.get).not.toHaveBeenCalled()
  })

  it('maps HERE addresses into a title, subtitle, and parts', async () => {
    native.get.mockResolvedValue({
      data: {
        items: [
          {
            id: 'here:1',
            address: {
              label: '12 Oak St, Springfield, IL 62701, United States',
              houseNumber: '12',
              street: 'Oak St',
              city: 'Springfield',
              state: 'Illinois',
              postalCode: '62701',
              countryName: 'United States',
            },
          },
        ],
      },
    })
    const [suggestion] = await searchPlaces(
      '12 Oak',
      { latitude: 39.8, longitude: -89.6 },
      'address'
    )

    const url = new URL(native.get.mock.lastCall![0])
    expect(url.searchParams.get('q')).toBe('12 Oak')
    expect(url.searchParams.get('in')).toBe('circle:39.8,-89.6;r=1000000')
    expect(suggestion).toEqual({
      id: 'here:1',
      title: '12 Oak St',
      subtitle: 'Springfield, IL 62701, United States',
      place: {
        address: '12 Oak St, Springfield, IL 62701, United States',
        postalAddress: {
          line1: '12 Oak St',
          city: 'Springfield',
          state: 'Illinois',
          zip: '62701',
          country: 'United States',
        },
      },
    })
    expect(await resolvePlace(suggestion!)).toBe(suggestion!.place)
    expect(native.resolve).not.toHaveBeenCalled()
  })

  it('orders MapKit address parts the way the contact form shows them', async () => {
    native.version = 2
    native.resolve.mockResolvedValueOnce({
      address: '1 Example Way, Springfield, IL 62701, United States',
      postalAddress: {
        zip: '62701',
        country: 'United States',
        line1: '1 Example Way',
        state: 'IL',
        city: 'Springfield',
      },
      latitude: 39.8,
      longitude: -89.6,
    } as never)
    const place = await resolvePlace({ id: 'a', title: 'A', subtitle: '' })
    expect(Object.keys(place!.postalAddress!)).toEqual([
      'line1',
      'city',
      'state',
      'zip',
      'country',
    ])
  })

  it('finds no points of interest without MapKit', async () => {
    expect(await searchPlaces('Kingdom Hall', undefined, 'all')).toEqual([])
    expect(native.get).not.toHaveBeenCalled()
  })
})

describe('formatPlanLocation', () => {
  it('shows a point of interest name over its address', () => {
    expect(
      formatPlanLocation({
        name: 'Kingdom Hall',
        address: '12 Oak St, Springfield IL 62701, United States',
        latitude: 39.8,
        longitude: -89.6,
      })
    ).toEqual({
      primary: 'Kingdom Hall',
      secondary: '12 Oak St, Springfield IL 62701, United States',
    })
  })

  it('shows just the address when there is no name', () => {
    expect(formatPlanLocation({ address: '12 Oak St' })).toEqual({
      primary: '12 Oak St',
    })
  })

  it('does not repeat an address that matches the name', () => {
    expect(
      formatPlanLocation({ name: '12 Oak St', address: '12 Oak St' })
    ).toEqual({ primary: '12 Oak St' })
  })

  it('ignores blank strings', () => {
    expect(formatPlanLocation({ name: '  ', address: '12 Oak St' })).toEqual({
      primary: '12 Oak St',
    })
  })

  it('falls back to coordinates', () => {
    expect(formatPlanLocation({ latitude: 39.8, longitude: -89.6 })).toEqual({
      primary: '39.80000, -89.60000',
    })
  })

  it('returns an empty primary line for an empty location', () => {
    expect(formatPlanLocation({})).toEqual({ primary: '' })
  })
})

describe('appleMapsUrl', () => {
  it('labels a point of interest by name and pins its coordinates', () => {
    expect(
      appleMapsUrl({
        name: "McDonald's",
        address: '1 Main St, Springfield',
        latitude: 39.8,
        longitude: -89.6,
      })
    ).toBe(
      "https://maps.apple.com/?q=McDonald's&ll=39.8%2C-89.6&address=1%20Main%20St%2C%20Springfield"
    )
  })

  it('uses the address as the query when there is no name', () => {
    expect(appleMapsUrl({ address: '1 Main St' })).toBe(
      'https://maps.apple.com/?q=1%20Main%20St&address=1%20Main%20St'
    )
  })

  it('pins bare coordinates', () => {
    expect(appleMapsUrl({ latitude: 0, longitude: 0 })).toBe(
      'https://maps.apple.com/?ll=0%2C0'
    )
  })

  it('encodes reserved characters', () => {
    expect(appleMapsUrl({ name: 'A & B Park' })).toBe(
      'https://maps.apple.com/?q=A%20%26%20B%20Park'
    )
  })

  it('returns undefined when there is nothing to show', () => {
    expect(appleMapsUrl({})).toBeUndefined()
    expect(appleMapsUrl({ latitude: 1 })).toBeUndefined()
  })
})
