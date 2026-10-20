import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { entryMinutes, splitMinutes } from '@/lib/entryMinutes'

describe('entryMinutes', () => {
  it('totals hours and minutes', () => {
    expect(entryMinutes({ hours: 2, minutes: 15 })).toBe(135)
    expect(entryMinutes({ hours: 0, minutes: 0 })).toBe(0)
  })

  it('keeps a negative Time Rollover entry negative', () => {
    expect(entryMinutes({ hours: 0, minutes: -20 })).toBe(-20)
    expect(entryMinutes({ hours: -1, minutes: -30 })).toBe(-90)
  })

  it('matches the hand-written hours * 60 + minutes sum it replaced', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.integer({ min: -59, max: 59 }),
        (hours, minutes) => {
          expect(entryMinutes({ hours, minutes })).toBe(hours * 60 + minutes)
        }
      )
    )
  })

  it('counts a missing or NaN part as 0', () => {
    expect(entryMinutes({ minutes: 45 })).toBe(45)
    expect(entryMinutes({ hours: 3 })).toBe(180)
    expect(entryMinutes({})).toBe(0)
    expect(entryMinutes({ hours: NaN, minutes: 10 })).toBe(10)
    expect(entryMinutes({ hours: 1, minutes: NaN })).toBe(60)
  })
})

describe('splitMinutes', () => {
  it('splits a total into hours and minutes', () => {
    expect(splitMinutes(135)).toEqual({ hours: 2, minutes: 15 })
    expect(splitMinutes(59)).toEqual({ hours: 0, minutes: 59 })
    expect(splitMinutes(120)).toEqual({ hours: 2, minutes: 0 })
  })

  it('truncates a negative total toward zero', () => {
    expect(splitMinutes(-90)).toEqual({ hours: -1, minutes: -30 })
  })

  it('matches floor and modulo for non-negative totals', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (total) => {
        expect(splitMinutes(total)).toEqual({
          hours: Math.floor(total / 60),
          minutes: total % 60,
        })
      })
    )
  })

  it('round-trips through entryMinutes', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (total) => {
        expect(entryMinutes(splitMinutes(total))).toBe(total)
      })
    )
  })
})
