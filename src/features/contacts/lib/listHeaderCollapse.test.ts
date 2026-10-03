import { describe, expect, it } from 'vitest'
import { trackListScroll } from '@/features/contacts/lib/listHeaderCollapse'

const long = { contentHeight: 3000, viewportHeight: 600 }

/** Plays scroll offsets through a fresh tracker; returns each decision. */
const play = (offsets: number[], sizes = long) => {
  const tracker = { lastY: 0, anchorY: 0 }
  return offsets.map((y) => trackListScroll(tracker, { y, ...sizes }))
}

describe('trackListScroll', () => {
  it('collapses once a downward swipe travels far enough', () => {
    expect(play([10, 20, 30])).toEqual([false, false, true])
  })

  it('expands on an upward swipe measured from the turnaround', () => {
    expect(play([200, 400, 390, 370])).toEqual([true, true, undefined, false])
  })

  it('ignores small wobbles', () => {
    expect(play([400, 390, 400]).slice(1)).toEqual([undefined, undefined])
  })

  it('always expands near the top', () => {
    expect(play([400, 10])).toEqual([true, false])
  })

  it('ignores rubber-banding past either end', () => {
    expect(play([-20, 2500])).toEqual([undefined, undefined])
  })

  it('stays open for a list that would fit once collapsed', () => {
    expect(
      play([100, 150], { contentHeight: 750, viewportHeight: 600 })
    ).toEqual([undefined, undefined])
  })
})
