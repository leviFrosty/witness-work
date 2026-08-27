import { describe, expect, it } from 'vitest'

import { computeScrollToTargetOffset } from 'react-native-reanimated-carousel/src/utils/compute-scroll-to-target-offset'
import { round } from 'react-native-reanimated-carousel/src/utils/log'

/**
 * Regression test for the map screen's "tap a pin, the carousel shows the wrong
 * person" bug (react-native-reanimated-carousel@4.0.3).
 *
 * MapScreen's pin tap calls carouselRef.scrollTo({ index }) and presents the
 * centered card as "the tapped person". Unpatched, the library's `to()`
 * (src/hooks/useCarouselController.tsx) targets `index * size * direction`
 * where direction is the sign of the current offset — so once handlerOffset is
 * positive (the user swiped backwards past the start in loop mode) every
 * scrollTo visually centers item `dataLength - index`, the wrong person, while
 * onSnapToItem and getCurrentIndex report that same mirrored value and the
 * app's id-based reconciliation cannot detect the mismatch.
 *
 * `patches/react-native-reanimated-carousel@4.0.3.patch` fixes this by
 * extracting the target-offset math into computeScrollToTargetOffset (which
 * this test imports — the exact code Metro bundles, since the package's
 * `react-native` entry points at src/) and making the loop-mode path anchor on
 * the resting page instead of mirroring. The surrounding pipeline below is
 * simulated with formulas copied verbatim from the (unpatched) library:
 *
 * - Active-index reaction — src/hooks/useCarouselController.tsx:92-116
 * - `offsetX` normalization — src/components/CarouselLayout.tsx:58-65
 * - Per-item translate sawtooth — src/hooks/useOffsetX.ts:27-76
 *
 * If a future package upgrade drops the patch, the import above fails and this
 * suite goes red — re-verify the upstream scrollTo math before removing.
 */

const SIZE = 390 // card width; any positive size behaves identically

// interpolate(..., Extrapolation.CLAMP) — piecewise linear, clamped ends
function interpolateClamp(
  x: number,
  inputRange: number[],
  outputRange: number[]
): number {
  if (x <= inputRange[0]) return outputRange[0]
  if (x >= inputRange[inputRange.length - 1])
    return outputRange[outputRange.length - 1]
  for (let k = 0; k < inputRange.length - 1; k++) {
    const [a, b] = [inputRange[k], inputRange[k + 1]]
    if (x >= a && x <= b) {
      const t = b === a ? 0 : (x - a) / (b - a)
      return outputRange[k] + t * (outputRange[k + 1] - outputRange[k])
    }
  }
  return outputRange[outputRange.length - 1]
}

// useCarouselController `to()` — computes the new handlerOffset for a
// scrollTo({ index: i }) call, via the real (patched) library util.
function scrollToIndex(params: {
  i: number
  handlerOffset: number
  dataLength: number
  loop: boolean
}): number {
  const { i, handlerOffset, dataLength, loop } = params
  return computeScrollToTargetOffset({
    index: i,
    size: SIZE,
    handlerOffsetValue: handlerOffset,
    dataLength,
    loop,
  })
}

// useCarouselController's useAnimatedReaction — the index reported through
// getCurrentIndex()/onSnapToItem once the offset settles.
function reportedIndex(handlerOffset: number, dataLength: number): number {
  const toInt = round(handlerOffset / SIZE) % dataLength
  const isPositive = handlerOffset <= 0
  return isPositive
    ? Math.abs(toInt)
    : Math.abs(toInt > 0 ? dataLength - toInt : 0)
}

// CarouselLayout offsetX + useOffsetX — which item the user actually sees
// centered in the viewport (translate x === 0).
function visuallyCenteredIndex(
  handlerOffset: number,
  dataLength: number
): number | undefined {
  const totalSize = SIZE * dataLength
  const offsetX = handlerOffset % totalSize

  const VALID_LENGTH = dataLength - 1
  const viewCount = Math.round((dataLength - 1) / 2)
  const positiveCount = viewCount
  const MAX = positiveCount * SIZE
  const MIN = -(VALID_LENGTH - positiveCount) * SIZE
  const HALF = 0.5 * SIZE

  let centered: number | undefined
  for (let index = 0; index < dataLength; index++) {
    let startPos = SIZE * index
    if (index > positiveCount) startPos = (index - dataLength) * SIZE

    const inputRange = [
      -totalSize,
      MIN - HALF - startPos - Number.MIN_VALUE,
      MIN - HALF - startPos,
      0,
      MAX + HALF - startPos,
      MAX + HALF - startPos + Number.MIN_VALUE,
      totalSize,
    ]
    const outputRange = [
      startPos,
      MAX + HALF - Number.MIN_VALUE,
      MIN - HALF,
      startPos,
      MAX + HALF,
      MIN - HALF + Number.MIN_VALUE,
      startPos,
    ]

    const x = interpolateClamp(offsetX, inputRange, outputRange)
    if (Math.abs(x) < 1e-6) centered = index
  }
  return centered
}

// One simulated pin tap on the map screen: scrollTo({ index }) then read what
// the user sees and what the carousel reports back to the app.
function tapPin(params: {
  tappedIndex: number
  handlerOffset: number
  dataLength: number
}) {
  const { tappedIndex, handlerOffset, dataLength } = params
  const settled = scrollToIndex({
    i: tappedIndex,
    handlerOffset,
    dataLength,
    loop: true,
  })
  return {
    settledOffset: settled,
    visible: visuallyCenteredIndex(settled, dataLength),
    reported: reportedIndex(settled, dataLength),
  }
}

const MARKER_COUNT = 57 // the reporting user's backup: 57 contacts with pins

describe('reanimated-carousel scrollTo({index}) direction bug (map pin taps)', () => {
  it('control: from a fresh carousel (offset 0), every pin tap centers the tapped contact', () => {
    for (let i = 1; i < MARKER_COUNT; i++) {
      const { visible, reported } = tapPin({
        tappedIndex: i,
        handlerOffset: 0,
        dataLength: MARKER_COUNT,
      })
      expect(visible, `tapped ${i}`).toBe(i)
      expect(reported, `tapped ${i}`).toBe(i)
    }
  })

  it('control: after forward swipes (negative offset), pin taps center the tapped contact', () => {
    for (let i = 0; i < MARKER_COUNT; i++) {
      if (i === 3) continue // scrollTo is a no-op when already on the index
      const { visible } = tapPin({
        tappedIndex: i,
        handlerOffset: -3 * SIZE, // user swiped forward to card 3
        dataLength: MARKER_COUNT,
      })
      expect(visible, `tapped ${i}`).toBe(i)
    }
  })

  it('after one backward swipe (positive offset), pin taps still center the tapped contact', () => {
    // User swipes backwards once from the first card: loop wraps to the last
    // card and handlerOffset settles at +SIZE.
    const handlerOffset = +SIZE

    const failures: Array<{
      tapped: number
      visible?: number
      reported: number
    }> = []
    for (let i = 0; i < MARKER_COUNT; i++) {
      const { visible, reported } = tapPin({
        tappedIndex: i,
        handlerOffset,
        dataLength: MARKER_COUNT,
      })
      if (visible !== i || reported !== i)
        failures.push({ tapped: i, visible, reported })
    }

    // Red on the unpatched library: every tap lands on
    // (dataLength - tapped) % dataLength — and onSnapToItem/getCurrentIndex
    // report that same mirrored value, so MapScreen's id-based reconciliation
    // could never catch it. Green with the patch.
    expect(failures).toEqual([])
  })

  it('holds for every marker count, target, and resting offset', () => {
    for (let n = 3; n <= 60; n++) {
      for (const pages of [-2, -1, 1, 2, n - 1, -(n - 1)]) {
        for (let i = 0; i < n; i++) {
          const { visible, reported } = tapPin({
            tappedIndex: i,
            handlerOffset: pages * SIZE,
            dataLength: n,
          })
          const at = `n=${n} offset=${pages} tapped=${i}`
          expect(visible, at).toBe(i)
          expect(reported, at).toBe(i)
        }
      }
    }
  })
})
