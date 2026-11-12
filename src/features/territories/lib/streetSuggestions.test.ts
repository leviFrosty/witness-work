import { describe, expect, it } from 'vitest'
import { savesDoorLocations } from '@/features/territories/lib/doors'
import {
  MAX_SAMPLE_POINTS,
  addStreetName,
  findOutlineStreets,
  newStreetNames,
  outlineSamplePoints,
  streetKey,
  suggestedStreet,
} from '@/features/territories/lib/streetSuggestions'
import type { Coordinate } from '@/types/contact'

const square = (size: number): Coordinate[] => [
  { latitude: 40, longitude: -75 },
  { latitude: 40 + size, longitude: -75 },
  { latitude: 40 + size, longitude: -75 + size },
  { latitude: 40, longitude: -75 + size },
]

const within = (point: Coordinate, outline: Coordinate[]) => {
  const latitudes = outline.map((corner) => corner.latitude)
  const longitudes = outline.map((corner) => corner.longitude)
  return (
    point.latitude >= Math.min(...latitudes) - 1e-9 &&
    point.latitude <= Math.max(...latitudes) + 1e-9 &&
    point.longitude >= Math.min(...longitudes) - 1e-9 &&
    point.longitude <= Math.max(...longitudes) + 1e-9
  )
}

describe('outlineSamplePoints', () => {
  it('returns nothing without an outline', () => {
    expect(outlineSamplePoints(undefined)).toEqual([])
    expect(outlineSamplePoints(square(0.004).slice(0, 2))).toEqual([])
  })

  it('stays within the cap for a large area', () => {
    const points = outlineSamplePoints(square(0.05))
    expect(points.length).toBeLessThanOrEqual(MAX_SAMPLE_POINTS)
    expect(points.length).toBeGreaterThan(15)
  })

  it('samples the edges and the inside of a few blocks', () => {
    const outline = square(0.004)
    const points = outlineSamplePoints(outline)
    expect(points.length).toBeGreaterThanOrEqual(8)
    expect(points.every((point) => within(point, outline))).toBe(true)
    const onEdge = points.filter(
      (point) =>
        Math.abs(point.latitude - 40) < 1e-9 ||
        Math.abs(point.longitude + 75) < 1e-9 ||
        Math.abs(point.latitude - 40.004) < 1e-9 ||
        Math.abs(point.longitude + 74.996) < 1e-9
    )
    expect(onEdge.length).toBeGreaterThanOrEqual(4)
    expect(points.length - onEdge.length).toBeGreaterThan(0)
  })

  it('keeps grid points inside a concave outline', () => {
    const outline: Coordinate[] = [
      { latitude: 40, longitude: -75 },
      { latitude: 40.01, longitude: -75 },
      { latitude: 40.01, longitude: -74.99 },
      { latitude: 40.005, longitude: -74.99 },
      { latitude: 40.005, longitude: -74.995 },
      { latitude: 40, longitude: -74.995 },
    ]
    const points = outlineSamplePoints(outline)
    const inNotch = points.filter(
      (point) =>
        point.latitude < 40.005 - 1e-6 && point.longitude > -74.995 + 1e-6
    )
    expect(inNotch).toEqual([])
  })

  it('respects a smaller cap and is stable', () => {
    const outline = square(0.01)
    expect(outlineSamplePoints(outline, 6)).toHaveLength(6)
    expect(outlineSamplePoints(outline)).toEqual(outlineSamplePoints(outline))
  })
})

describe('streetKey', () => {
  it('ignores case, punctuation and common suffix spellings', () => {
    expect(streetKey('Maple Street')).toBe(streetKey('maple st.'))
    expect(streetKey('North Oak Avenue')).toBe(streetKey('N Oak Ave'))
    expect(streetKey('Calle Río')).toBe(streetKey('calle rio'))
    expect(streetKey('Maple Street')).not.toBe(streetKey('Maple Road'))
  })
})

describe('addStreetName', () => {
  it('keeps the first spelling in the order found', () => {
    let found: readonly string[] = []
    for (const name of [
      'Birch Lane',
      null,
      'Cedar Street',
      'birch ln',
      '  ',
      'Alder Way',
    ])
      found = addStreetName(found, name)
    expect(found).toEqual(['Birch Lane', 'Cedar Street', 'Alder Way'])
  })
})

describe('newStreetNames', () => {
  it('drops streets the territory already has', () => {
    expect(
      newStreetNames(
        ['Birch Lane', 'Cedar Street', 'Alder Way'],
        [{ name: 'cedar st' }]
      )
    ).toEqual(['Birch Lane', 'Alder Way'])
  })
})

describe('suggestedStreet', () => {
  it('matches a street added with the form defaults', () => {
    const street = suggestedStreet('street-1', ' Birch Lane ')
    expect(street).toEqual({
      id: 'street-1',
      name: 'Birch Lane',
      numbering: 'both',
      next: 1,
      first: 1,
      descending: undefined,
      doors: [],
      workedAt: undefined,
      saveLocations: undefined,
    })
    expect(savesDoorLocations(street)).toBe(true)
  })
})

describe('findOutlineStreets', () => {
  const points = outlineSamplePoints(square(0.004)).slice(0, 4)

  it('asks one point at a time and collects names in order', async () => {
    let active = 0
    const answers = [
      [{ street: 'Birch Lane' }],
      [{ street: null }],
      [{ street: 'Cedar Street' }, { street: 'birch ln' }],
      [],
    ]
    const progress: number[] = []
    const search = await findOutlineStreets({
      points,
      geocode: async () => {
        active += 1
        expect(active).toBe(1)
        await Promise.resolve()
        active -= 1
        return answers.shift() ?? []
      },
      onProgress: (state) => progress.push(state.checked),
      cancelled: () => false,
    })
    expect(search).toEqual({
      names: ['Birch Lane', 'Cedar Street'],
      checked: 4,
      total: 4,
      stopped: false,
      done: true,
    })
    expect(progress).toEqual([1, 2, 3, 4, 4])
  })

  it('stops at the first error and keeps what it found', async () => {
    let calls = 0
    const search = await findOutlineStreets({
      points,
      geocode: async () => {
        calls += 1
        if (calls === 2) throw new Error('throttled')
        return [{ street: 'Birch Lane' }]
      },
      onProgress: () => {},
      cancelled: () => false,
    })
    expect(calls).toBe(2)
    expect(search).toMatchObject({
      names: ['Birch Lane'],
      checked: 1,
      stopped: true,
      done: true,
    })
  })

  it('stops asking once the person leaves', async () => {
    let calls = 0
    let left = false
    await findOutlineStreets({
      points,
      geocode: async () => {
        calls += 1
        left = true
        return []
      },
      onProgress: () => {},
      cancelled: () => left,
    })
    expect(calls).toBe(1)
  })
})
