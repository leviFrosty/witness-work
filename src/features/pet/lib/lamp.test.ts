import { describe, expect, it } from 'vitest'
import { lampLevel } from '@/features/pet/lib/lamp'

describe('lampLevel', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [6, 2],
    [7, 3],
    [13, 3],
    [14, 4],
    [29, 4],
    [30, 5],
    [400, 5],
  ])('a %i-day plans streak burns at %i', (count, level) => {
    expect(lampLevel({ kind: 'plans', count }, true)).toBe(level)
  })

  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [5, 3],
    [6, 4],
    [11, 4],
    [12, 5],
    [40, 5],
  ])('a %i-month streak burns at %i', (count, level) => {
    expect(lampLevel({ kind: 'months', count }, true)).toBe(level)
  })

  it('burns at 3 with streaks hidden, whatever the count', () => {
    expect(lampLevel({ kind: 'plans', count: 0 }, false)).toBe(3)
    expect(lampLevel({ kind: 'months', count: 24 }, false)).toBe(3)
  })
})
