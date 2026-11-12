import { describe, expect, it } from 'vitest'
import {
  fitPoints,
  hasTerritoryMap,
  markerSpacing,
  metresPerPoint,
  openingView,
  drawsAsDot,
  showsMarkerDots,
  streetFocus,
  territoryMapMarkers,
} from '@/features/territories/lib/territoryMap'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const here = (n: number) => ({ latitude: n, longitude: n })

const street = (patch: Partial<TerritoryStreet> = {}): TerritoryStreet => ({
  id: 's1',
  name: 'Oak Street',
  numbering: 'even',
  next: 12,
  doors: [],
  ...patch,
})

const territory = (patch: Partial<Territory> = {}): Territory => ({
  id: 't1',
  number: '14',
  checkedOutAt: 0,
  createdAt: 0,
  streets: [],
  doNotCalls: [],
  ...patch,
})

const address = (s: Pick<TerritoryStreet, 'name'>, d: { label: string }) =>
  `${d.label} ${s.name}`

const worked = territory({
  people: [{ id: 'p1', name: 'Sam', kind: 'buddy' }],
  streets: [
    street({
      doors: [
        {
          id: 'd1',
          label: '2',
          outcome: 'spoke',
          at: 10,
          tries: 1,
          coordinate: here(1),
          by: 'p1',
        },
        { id: 'd2', label: '4', outcome: 'notHome', at: 20, tries: 3 },
        {
          id: 'd3',
          label: '6',
          outcome: 'doNotCall',
          at: 30,
          tries: 1,
          coordinate: here(3),
        },
        {
          id: 'd4',
          label: '8',
          outcome: 'notHome',
          at: 40,
          tries: 2,
          coordinate: here(4),
          by: 'someone-else',
        },
      ],
    }),
    street({ id: 's2', name: 'Elm Street', doors: [] }),
  ],
  doNotCalls: [
    { id: 'n1', address: '9 Elm Street', at: 5, coordinate: here(9) },
    { id: 'n2', address: '11 Elm Street', at: 6 },
  ],
})

const plain = { privacy: false, formatAddress: address }

describe('territoryMapMarkers', () => {
  it('marks every door and do-not-call with a saved location', () => {
    const markers = territoryMapMarkers(worked, plain)
    expect(markers.map((marker) => `${marker.kind}:${marker.id}`)).toEqual([
      'door:d1',
      'door:d4',
      'doNotCall:n1',
      'doNotCall:d3',
    ])
  })

  it('names the person who recorded a door only when they are known', () => {
    const [first, second] = territoryMapMarkers(worked, plain)
    expect(first).toMatchObject({
      address: '2 Oak Street',
      outcome: 'spoke',
      by: { name: 'Sam' },
    })
    expect(second).toMatchObject({ tries: 2, by: undefined })
  })

  it('keeps door do-not-calls on their street', () => {
    const markers = territoryMapMarkers(worked, plain)
    expect(markers.find((marker) => marker.id === 'd3')).toMatchObject({
      kind: 'doNotCall',
      streetId: 's1',
      address: '6 Oak Street',
    })
  })

  it('shows no doors in privacy mode', () => {
    const markers = territoryMapMarkers(worked, {
      ...plain,
      privacy: true,
    })
    expect(markers.every((marker) => marker.kind === 'doNotCall')).toBe(true)
  })
})

describe('hasTerritoryMap', () => {
  it('needs a photo, a pin, an outline or a marker', () => {
    expect(hasTerritoryMap(territory(), [])).toBe(false)
    expect(hasTerritoryMap(territory({ photo: 'card.jpg' }), [])).toBe(true)
    expect(hasTerritoryMap(territory({ coordinate: here(1) }), [])).toBe(true)
    expect(
      hasTerritoryMap(territory({ outline: [here(1), here(2), here(3)] }), [])
    ).toBe(true)
    expect(hasTerritoryMap(territory({ outline: [here(1)] }), [])).toBe(false)
    expect(
      hasTerritoryMap(territory(), territoryMapMarkers(worked, plain))
    ).toBe(true)
  })
})

describe('openingView', () => {
  it('opens on the card when there is nothing for a map', () => {
    expect(openingView(territory({ photo: 'card.jpg' }), [])).toBe('card')
    expect(openingView(territory({ photo: 'card.jpg' }), [], 'map')).toBe(
      'card'
    )
  })

  it('opens on the map unless the card was asked for', () => {
    const both = territory({ photo: 'card.jpg', coordinate: here(1) })
    expect(openingView(both, [])).toBe('map')
    expect(openingView(both, [], 'card')).toBe('card')
    expect(openingView(territory({ coordinate: here(1) }), [], 'card')).toBe(
      'map'
    )
  })
})

describe('streetFocus', () => {
  it('focuses a street only when something on it is pinned', () => {
    const markers = territoryMapMarkers(worked, plain)
    expect(streetFocus(markers, 's1')).toBe('s1')
    expect(streetFocus(markers, 's2')).toBeUndefined()
    expect(streetFocus(markers, undefined)).toBeUndefined()
  })
})

describe('fitPoints', () => {
  const markers = territoryMapMarkers(worked, plain)
  const outlined = { ...worked, outline: [here(10), here(11), here(12)] }

  it('fits the whole territory', () => {
    expect(fitPoints(outlined, markers)).toHaveLength(7)
  })

  it('fits one street when it has markers', () => {
    expect(fitPoints(outlined, markers, 's1')).toEqual([
      here(1),
      here(4),
      here(3),
    ])
  })

  it('falls back to the territory when the street has none', () => {
    expect(fitPoints(outlined, markers, 's2')).toHaveLength(7)
  })
})

describe('marker dots', () => {
  const step = 15 / 111_320
  const row = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      latitude: index * step,
      longitude: 0,
    }))

  it('spaces markers by the typical gap to the nearest neighbour', () => {
    expect(markerSpacing(row(5))).toBeCloseTo(15, 5)
    expect(
      markerSpacing([...row(4), { latitude: 1, longitude: 1 }])
    ).toBeCloseTo(15, 5)
  })

  it('has no spacing for fewer than two markers', () => {
    expect(markerSpacing([])).toBeUndefined()
    expect(markerSpacing(row(1))).toBeUndefined()
  })

  it('turns metres into points from the visible span', () => {
    expect(metresPerPoint(0.01, 1113.2)).toBeCloseTo(1, 5)
    expect(metresPerPoint(0.01, 0)).toBeUndefined()
  })

  it('draws dots when neighbouring markers would overlap', () => {
    expect(showsMarkerDots(15, 1)).toBe(true)
    expect(showsMarkerDots(15, 0.5)).toBe(false)
    expect(showsMarkerDots(30, 1)).toBe(false)
  })

  it('draws full markers when there is nothing to overlap', () => {
    expect(showsMarkerDots(undefined, 1)).toBe(false)
    expect(showsMarkerDots(15, undefined)).toBe(false)
  })
})

describe('drawsAsDot', () => {
  it('keeps do-not-calls full size when doors shrink to dots', () => {
    expect(drawsAsDot({ kind: 'door' }, true)).toBe(true)
    expect(drawsAsDot({ kind: 'doNotCall' }, true)).toBe(false)
    expect(drawsAsDot({ kind: 'door' }, false)).toBe(false)
  })
})
