import { describe, expect, it } from 'vitest'
import {
  createBarsScrollTracker,
  fitsWithoutScrolling,
  trackBarsScroll,
  type BarsScrollFrame,
} from '@/lib/hideBarsOnScroll'

const long = { contentHeight: 3000, viewportHeight: 600 }

const play = (frames: (number | Partial<BarsScrollFrame>)[], sizes = long) => {
  const tracker = createBarsScrollTracker()
  return frames.map((frame) =>
    trackBarsScroll(
      tracker,
      typeof frame === 'number'
        ? { y: frame, ...sizes }
        : { y: 0, ...sizes, ...frame }
    )
  )
}

describe('trackBarsScroll', () => {
  it('hides once a downward swipe travels far enough', () => {
    expect(play([10, 20, 30])).toEqual([false, false, true])
  })

  it('shows on an upward swipe measured from the turnaround', () => {
    expect(play([200, 400, 390, 370])).toEqual([true, true, undefined, false])
  })

  it('ignores small wobbles', () => {
    expect(play([400, 390, 400]).slice(1)).toEqual([undefined, undefined])
  })

  it('always shows near the top, and when pulled past it', () => {
    expect(play([400, 10])).toEqual([true, false])
    expect(play([400, -20])).toEqual([true, false])
  })

  it('ignores rubber-banding past the end', () => {
    expect(play([2300, 2500])).toEqual([true, undefined])
  })

  it('stays put for content that would fit once the header is gone', () => {
    expect(
      play([100, 150], { contentHeight: 750, viewportHeight: 600 })
    ).toEqual([undefined, undefined])
  })

  it("doesn't count the viewport growing as the header leaves", () => {
    expect(
      play([
        { y: 2300 },
        { y: 2400 },
        { y: 2340, viewportHeight: 660 },
        { y: 2340, viewportHeight: 660 },
      ])
    ).toEqual([true, true, undefined, undefined])
  })

  it("doesn't count rows going in above as a swipe down", () => {
    expect(
      play([
        { y: 900 },
        { y: 860 },
        { y: 1460, contentHeight: 3600 },
        { y: 1450, contentHeight: 3600 },
      ])
    ).toEqual([true, false, undefined, undefined])
  })
})

it('still treats the shift as an insertion when it lands a frame late', () => {
  expect(
    play([
      { y: 900 },
      { y: 860 },
      { y: 860, contentHeight: 3600 },
      { y: 1460, contentHeight: 3600 },
    ])
  ).toEqual([true, false, false, undefined])
})

it('needs more overflow before hiding at larger text sizes', () => {
  const tracker = createBarsScrollTracker(2)
  const sizes = { contentHeight: 1000, viewportHeight: 600 }
  expect(trackBarsScroll(tracker, { y: 100, ...sizes })).toBeUndefined()
})

describe('fitsWithoutScrolling', () => {
  it('is true only once the viewport is known and holds the content', () => {
    expect(fitsWithoutScrolling(500, 0)).toBe(false)
    expect(fitsWithoutScrolling(610, 600)).toBe(true)
    expect(fitsWithoutScrolling(900, 600)).toBe(false)
  })
})
