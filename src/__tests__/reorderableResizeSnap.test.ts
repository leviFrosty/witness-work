import { describe, expect, it } from 'vitest'
import {
  resizeAccessories,
  snapResize,
} from '@/components/ui/reorderable/resizeSnap'

const grid = [
  { size: 'small' as const, width: 170 },
  { size: 'wide' as const, width: 352 },
]

describe('snapResize', () => {
  const small = { width: 170, height: 110, size: 'small' as const }

  it('stays put for a small drag', () => {
    expect(
      snapResize({
        options: grid,
        current: 'small',
        start: small,
        forward: 40,
        down: 0,
      })
    ).toBe('small')
  })

  it('snaps to wide once the corner is clearly nearer that width', () => {
    expect(
      snapResize({
        options: grid,
        current: 'small',
        start: small,
        forward: 120,
        down: 0,
      })
    ).toBe('wide')
  })

  it('needs to get clearly nearer, not just past halfway', () => {
    expect(
      snapResize({
        options: grid,
        current: 'small',
        start: small,
        forward: 95,
        down: 0,
      })
    ).toBe('small')
  })

  it('snaps back to small when dragged back in', () => {
    const wide = { width: 352, height: 110, size: 'wide' as const }
    expect(
      snapResize({
        options: grid,
        current: 'wide',
        start: wide,
        forward: -150,
        down: 0,
      })
    ).toBe('small')
  })

  it('compares heights where given, lined up with the real height', () => {
    const days = [
      { size: 'compact' as const, width: 352, height: 118 },
      { size: 'full' as const, width: 352, height: 190 },
    ]

    const start = { width: 352, height: 160, size: 'compact' as const }
    expect(
      snapResize({
        options: days,
        current: 'compact',
        start,
        forward: 0,
        down: 10,
      })
    ).toBe('compact')
    expect(
      snapResize({
        options: days,
        current: 'compact',
        start,
        forward: 0,
        down: 70,
      })
    ).toBe('full')
  })

  it('steps through sizes when they all share a frame', () => {
    const column = [
      { size: 'small' as const, width: 300 },
      { size: 'wide' as const, width: 300 },
    ]
    const start = { width: 300, height: 110, size: 'small' as const }
    expect(
      snapResize({
        options: column,
        current: 'small',
        start,
        forward: 30,
        down: 0,
      })
    ).toBe('small')
    expect(
      snapResize({
        options: column,
        current: 'small',
        start,
        forward: 80,
        down: 80,
      })
    ).toBe('wide')
  })
})

describe('resizeAccessories', () => {
  it('points the ways the sizes differ', () => {
    expect(resizeAccessories(grid)).toEqual(['left', 'right'])
    expect(
      resizeAccessories([
        { size: 'compact', width: 300, height: 100 },
        { size: 'full', width: 300, height: 200 },
      ])
    ).toEqual(['up', 'down'])
  })
})
