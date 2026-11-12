import { describe, expect, it } from 'vitest'
import {
  BUDDY_SLOT_COLOR_COUNT,
  nextBuddyColorIndex,
} from '@/features/buddies/lib/buddyColors'

const next = (...used: number[]) => nextBuddyColorIndex(new Set(used))
const colorOf = (index: number) => index % BUDDY_SLOT_COLOR_COUNT

describe('nextBuddyColorIndex', () => {
  it('gives the first buddies a color each, in order', () => {
    expect(next()).toBe(0)
    expect(next(0)).toBe(1)
    expect(next(0, 1, 3)).toBe(2)
    expect(next(0, 1, 2, 3)).toBe(4)
  })

  it('reuses the least-used color once every color is taken', () => {
    expect(next(0, 1, 2, 3, 4)).toBe(5)
    expect(colorOf(next(0, 1, 2, 3, 4, 5, 6))).toBe(2)
    expect(next(0, 1, 3, 4, 5, 6, 7, 8, 9)).toBe(2)
    expect(colorOf(next(5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4))).toBe(0)
  })

  it('never hands out an index already in use', () => {
    const used = new Set<number>()
    for (let n = 0; n < 50; n++) {
      const index = nextBuddyColorIndex(used)
      expect(used.has(index)).toBe(false)
      used.add(index)
    }
    const perColor = Array.from({ length: BUDDY_SLOT_COLOR_COUNT }, () => 0)
    for (const index of used) perColor[colorOf(index)]++
    expect(perColor).toEqual([10, 10, 10, 10, 10])
  })
})
