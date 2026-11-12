import { describe, expect, it } from 'vitest'
import {
  peekWindowHeight,
  peekWindowScrolls,
  peekWindowTopIndex,
} from '@/lib/peekWindow'

const month = { count: 30, visibleRows: 5 }

describe('peekWindowTopIndex', () => {
  it('puts the focused row second, with one row above it', () => {
    expect(peekWindowTopIndex({ ...month, focusIndex: 18 })).toBe(17)
    expect(peekWindowTopIndex({ ...month, focusIndex: 1 })).toBe(0)
  })

  it('starts at the top when the focused row is the first one', () => {
    expect(peekWindowTopIndex({ ...month, focusIndex: 0 })).toBe(0)
  })

  it('ends on the last row instead of leaving blank rows below it', () => {
    expect(peekWindowTopIndex({ ...month, focusIndex: 29 })).toBe(25)
    expect(peekWindowTopIndex({ ...month, focusIndex: 28 })).toBe(25)
    expect(peekWindowTopIndex({ ...month, focusIndex: 27 })).toBe(25)
    expect(peekWindowTopIndex({ ...month, focusIndex: 26 })).toBe(25)
    expect(peekWindowTopIndex({ ...month, focusIndex: 25 })).toBe(24)
  })

  it('opens at the start or the end when nothing is focused', () => {
    expect(peekWindowTopIndex({ ...month, focusIndex: null })).toBe(0)
    expect(
      peekWindowTopIndex({ ...month, focusIndex: null, withoutFocus: 'end' })
    ).toBe(25)
  })

  it('treats an out-of-range focus as none', () => {
    expect(peekWindowTopIndex({ ...month, focusIndex: -1 })).toBe(0)
    expect(peekWindowTopIndex({ ...month, focusIndex: 30 })).toBe(0)
  })

  it('stays at the top when every row fits', () => {
    expect(
      peekWindowTopIndex({ count: 4, visibleRows: 5, focusIndex: 3 })
    ).toBe(0)
    expect(
      peekWindowTopIndex({
        count: 5,
        visibleRows: 5,
        focusIndex: null,
        withoutFocus: 'end',
      })
    ).toBe(0)
    expect(
      peekWindowTopIndex({ count: 0, visibleRows: 5, focusIndex: null })
    ).toBe(0)
  })

  it('takes a different lead', () => {
    expect(peekWindowTopIndex({ ...month, focusIndex: 10, lead: 0 })).toBe(10)
    expect(peekWindowTopIndex({ ...month, focusIndex: 10, lead: 2 })).toBe(8)
  })

  it('clamps to the last row when the window is one row', () => {
    expect(
      peekWindowTopIndex({ count: 30, visibleRows: 1, focusIndex: 29 })
    ).toBe(28)
    expect(
      peekWindowTopIndex({
        count: 30,
        visibleRows: 1,
        focusIndex: null,
        withoutFocus: 'end',
      })
    ).toBe(29)
  })
})

describe('peekWindowHeight', () => {
  it('cuts off the row after the last whole one', () => {
    expect(peekWindowHeight(30, 5, 40)).toBe(224)
  })

  it('has no fixed height when every row fits', () => {
    expect(peekWindowScrolls(5, 5)).toBe(false)
    expect(peekWindowHeight(5, 5, 40)).toBeUndefined()
    expect(peekWindowHeight(3, 5, 40)).toBeUndefined()
  })

  it('waits for a measured row', () => {
    expect(peekWindowHeight(30, 5, 0)).toBeUndefined()
  })
})
