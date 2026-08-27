import { describe, expect, it } from 'vitest'

// v5 intentionally exports only its public component API. This test imports
// the installed package's dependency-free source helpers by file path so it
// exercises the exact target-page math used by useCarouselController without
// pretending these helpers are part of the app's production API surface.
import {
  getLogicalProgress,
  getNearestLogicalPage,
  getOffsetForLogicalPage,
  getSettledRawIndex,
  getShortestLoopTargetPage,
  positiveModulo,
  reconcileOffsetAfterDataChange,
} from '../../node_modules/react-native-reanimated-carousel/src/utils/carousel-math'

/**
 * Regression coverage for the map screen's "tap a Marker, show the wrong
 * Contact" bug. In v4, scrollTo({ index }) mirrored its target after a single
 * backward swipe in loop mode. WitnessWork patched that offset formula.
 *
 * V5 models the carousel as continuous logical pages. scrollTo converts the
 * current offset to a page, picks the nearest page whose modulo is the target
 * index, then converts that page back to an offset. This simulation composes
 * those real pure helpers and verifies both the visually centered and settled
 * indices across the same exhaustive sweep that guarded the v4 patch.
 */

const SIZE = 390
const MARKER_COUNT = 57

function tapMarker(params: {
  tappedIndex: number
  handlerOffset: number
  dataLength: number
}) {
  const { tappedIndex, handlerOffset, dataLength } = params
  const currentPage = getNearestLogicalPage(handlerOffset, SIZE)
  const targetPage = getShortestLoopTargetPage({
    currentPage,
    targetIndex: tappedIndex,
    count: dataLength,
  })
  const settledOffset = getOffsetForLogicalPage(targetPage, SIZE)
  const settledProgress = getLogicalProgress(settledOffset, SIZE)

  return {
    currentPage,
    targetPage,
    settledOffset,
    // The helper preserves JavaScript's -0 for page zero; normalize it for
    // identity assertions because carousel index 0 and -0 are equivalent.
    visible:
      positiveModulo(getNearestLogicalPage(settledOffset, SIZE), dataLength) ||
      0,
    reported: getSettledRawIndex(settledProgress, dataLength) || 0,
  }
}

describe('reanimated-carousel v5 looped scrollTo({ index }) (map Marker taps)', () => {
  it('centers every requested Contact from a fresh carousel', () => {
    for (let i = 0; i < MARKER_COUNT; i++) {
      const result = tapMarker({
        tappedIndex: i,
        handlerOffset: 0,
        dataLength: MARKER_COUNT,
      })
      expect(result.visible, `tapped ${i}`).toBe(i)
      expect(result.reported, `tapped ${i}`).toBe(i)
    }
  })

  it('does not mirror Marker targets after one backward swipe', () => {
    // Backward from the first card wraps to logical page -1 (raw index 56),
    // represented by the positive offset that triggered the v4 regression.
    const handlerOffset = SIZE

    for (let i = 0; i < MARKER_COUNT; i++) {
      const result = tapMarker({
        tappedIndex: i,
        handlerOffset,
        dataLength: MARKER_COUNT,
      })
      expect(result.visible, `tapped ${i}`).toBe(i)
      expect(result.reported, `tapped ${i}`).toBe(i)
      expect(result.settledOffset).toBe(
        result.targetPage === 0 ? 0 : -result.targetPage * SIZE
      )
    }
  })

  it('holds for every Marker count, target, and resting direction', () => {
    for (let count = 3; count <= 60; count++) {
      const restingPages = [
        -count - 1,
        -(count - 1),
        -2,
        -1,
        0,
        1,
        2,
        count - 1,
        count + 1,
      ]

      for (const currentPage of restingPages) {
        for (let tappedIndex = 0; tappedIndex < count; tappedIndex++) {
          const result = tapMarker({
            tappedIndex,
            handlerOffset: getOffsetForLogicalPage(currentPage, SIZE),
            dataLength: count,
          })
          const at = `count=${count} page=${currentPage} tapped=${tappedIndex}`

          expect(result.visible, at).toBe(tappedIndex)
          expect(result.reported, at).toBe(tappedIndex)
          expect(
            Math.abs(result.targetPage - currentPage),
            at
          ).toBeLessThanOrEqual(Math.ceil(count / 2))
        }
      }
    }
  })

  it('chooses logical forward on an exact shortest-route tie', () => {
    expect(
      getShortestLoopTargetPage({ currentPage: 0, targetIndex: 2, count: 4 })
    ).toBe(2)
    expect(
      getShortestLoopTargetPage({ currentPage: -1, targetIndex: 1, count: 4 })
    ).toBe(1)
  })

  it('reconciles the selected Contact while filtering from many to one and back', () => {
    const narrowedOffset = reconcileOffsetAfterDataChange({
      offset: getOffsetForLogicalPage(23, SIZE),
      itemSize: SIZE,
      previousCount: MARKER_COUNT,
      nextCount: 1,
      defaultIndex: 0,
      loop: false,
      retainedIndex: 0,
    })
    expect(narrowedOffset).toBe(0)

    const expandedOffset = reconcileOffsetAfterDataChange({
      offset: narrowedOffset,
      itemSize: SIZE,
      previousCount: 1,
      nextCount: MARKER_COUNT,
      defaultIndex: 0,
      loop: true,
      retainedIndex: 23,
    })
    expect(
      getSettledRawIndex(getLogicalProgress(expandedOffset, SIZE), 57)
    ).toBe(23)
  })
})
