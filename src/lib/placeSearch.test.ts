import { describe, expect, it, vi } from 'vitest'

vi.mock('../../modules/place-search', () => ({
  isAvailable: false,
  autocomplete: vi.fn(async () => []),
  resolve: vi.fn(async () => null),
}))

import { appleMapsUrl, formatPlanLocation } from '@/lib/placeSearch'

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
