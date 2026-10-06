import { describe, expect, it } from 'vitest'
import { reorderForDrag, rowLength, rowSlots } from '@/lib/sortableRow'

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
    // b's middle is at 98; a is 40 wide.
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
