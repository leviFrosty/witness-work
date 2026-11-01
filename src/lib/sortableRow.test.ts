import { describe, expect, it } from 'vitest'
import {
  isInDragHandle,
  reorderForDrag,
  rowLength,
  rowSlots,
} from '@/lib/sortableRow'

const widths = { a: 40, b: 100, c: 60 }

describe('rowSlots', () => {
  it('lays items out end to end with the gap between', () => {
    expect(rowSlots(['a', 'b', 'c'], widths, 8)).toEqual({
      a: 0,
      b: 48,
      c: 156,
    })
    expect(rowSlots(['c', 'a'], widths, 8)).toEqual({ c: 0, a: 68 })
  })

  it('measures the whole row', () => {
    expect(rowLength(['a', 'b', 'c'], widths, 8)).toBe(216)
    expect(rowLength([], widths, 8)).toBe(0)
  })
})

describe('reorderForDrag', () => {
  const order = ['a', 'b', 'c']

  it('keeps the order until the middle of a neighbor is crossed', () => {
    expect(reorderForDrag(order, 'a', 50, widths, 8)).toBe(order)
    expect(reorderForDrag(order, 'a', 80, widths, 8)).toEqual(['b', 'a', 'c'])
  })

  it('passes several neighbors in one move', () => {
    expect(reorderForDrag(order, 'a', 200, widths, 8)).toEqual(['b', 'c', 'a'])
    expect(reorderForDrag(order, 'c', -40, widths, 8)).toEqual(['c', 'a', 'b'])
  })

  it("doesn't swap back right after passing a wider neighbor", () => {
    const next = reorderForDrag(order, 'a', 80, widths, 8)
    expect(reorderForDrag(next, 'a', 80, widths, 8)).toBe(next)
  })

  it('ignores a key that is not in the row', () => {
    expect(reorderForDrag(order, 'z', 500, widths, 8)).toBe(order)
  })
})

describe('isInDragHandle', () => {
  it('is the right end in LTR', () => {
    expect(isInDragHandle(346, 390, 44, false)).toBe(true)
    expect(isInDragHandle(389, 390, 44, false)).toBe(true)
    expect(isInDragHandle(345, 390, 44, false)).toBe(false)
    expect(isInDragHandle(10, 390, 44, false)).toBe(false)
  })

  it('is the left end in RTL, where x is still measured from the left', () => {
    expect(isInDragHandle(0, 390, 44, true)).toBe(true)
    expect(isInDragHandle(44, 390, 44, true)).toBe(true)
    expect(isInDragHandle(45, 390, 44, true)).toBe(false)
    expect(isInDragHandle(380, 390, 44, true)).toBe(false)
  })

  it('has no handle without a handle width or before the row is measured', () => {
    expect(isInDragHandle(380, 390, 0, false)).toBe(false)
    expect(isInDragHandle(10, 390, 0, true)).toBe(false)
    expect(isInDragHandle(10, 0, 44, true)).toBe(false)
  })
})
