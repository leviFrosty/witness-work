import { describe, expect, it } from 'vitest'
import { getFoldSplit, type FoldSplitInput } from '@/lib/foldSplit'

// iPhone Duo's inner display in portrait, folded like a book.
const bookFold = { x: 314, y: 0, width: 40, height: 951, active: true }

const base: FoldSplitInput = {
  width: 669,
  paddingHorizontal: 24,
  gap: 24,
  leading: { fraction: 0.44 },
  minColumnWidth: 200,
  divisions: [],
  rtl: false,
}

describe('fold split', () => {
  it('keeps its proportions while the display is flat', () => {
    expect(getFoldSplit(base)).toEqual({
      leadingWidth: Math.round((669 - 48 - 24) * 0.44),
      gap: 24,
      folded: false,
    })
  })

  it('ignores a fold that is inactive (fully open)', () => {
    expect(
      getFoldSplit({ ...base, divisions: [{ ...bookFold, active: false }] })
        .folded
    ).toBe(false)
  })

  it('puts the gap over a book fold, one column on each side', () => {
    const split = getFoldSplit({ ...base, divisions: [bookFold] })
    expect(split).toEqual({ leadingWidth: 314 - 24, gap: 40, folded: true })
    // The trailing column starts where the fold ends.
    expect(24 + split.leadingWidth + split.gap).toBe(bookFold.x + 40)
  })

  it('keeps at least the usual gap around a narrow fold', () => {
    const split = getFoldSplit({
      ...base,
      divisions: [{ ...bookFold, x: 330, width: 8 }],
    })
    expect(split).toEqual({
      leadingWidth: 334 - 12 - 24,
      gap: 24,
      folded: true,
    })
  })

  it('mirrors for right-to-left layouts', () => {
    const split = getFoldSplit({ ...base, rtl: true, divisions: [bookFold] })
    // The leading column runs from the fold's trailing side to the padding.
    expect(split.leadingWidth).toBe(669 - 24 - (314 + 40))
    expect(split.gap).toBe(40)
  })

  it('replaces a fixed leading width while folded', () => {
    expect(
      getFoldSplit({ ...base, leading: { width: 350 }, paddingHorizontal: 0 })
        .leadingWidth
    ).toBe(350)
    expect(
      getFoldSplit({
        ...base,
        leading: { width: 350 },
        paddingHorizontal: 0,
        divisions: [bookFold],
      }).leadingWidth
    ).toBe(314)
  })

  it('leaves a laptop-style fold to the scrolling columns', () => {
    expect(
      getFoldSplit({
        ...base,
        width: 951,
        divisions: [{ x: 0, y: 314, width: 951, height: 40, active: true }],
      }).folded
    ).toBe(false)
  })

  it('stays flat when a column would get too narrow', () => {
    expect(
      getFoldSplit({
        ...base,
        width: 1000,
        divisions: [{ ...bookFold, x: 120 }],
      }).folded
    ).toBe(false)
  })
})
