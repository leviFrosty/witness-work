import { describe, expect, it } from 'vitest'
import { lampLevel } from '@/features/pet/lib/lamp'

describe('lampLevel', () => {
  it.each([
    [0, 0],
    [0.5, 0],
    [1, 1],
    [2.4, 2],
    [3, 3],
    [4.99, 4],
    [5, 5],
    [6, 5],
  ])('%d hearts burn at %i', (hearts, level) => {
    expect(lampLevel({ hearts, dead: false })).toBe(level)
  })

  it('goes out when the pet dies, or the hearts are not a number', () => {
    expect(lampLevel({ hearts: 5, dead: true })).toBe(0)
    expect(lampLevel({ hearts: Number.NaN, dead: false })).toBe(0)
    expect(lampLevel({ hearts: -2, dead: false })).toBe(0)
  })
})
