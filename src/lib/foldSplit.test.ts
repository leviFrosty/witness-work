import { describe, expect, it } from 'vitest'
import {
  clampToFoldSide,
  getFoldColumn,
  getFoldPane,
  getFoldSplit,
  type FoldDivision,
  type FoldSplitInput,
} from '@/lib/foldSplit'

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

  it('gives a fixed trailing width the rest to the leading column', () => {
    expect(
      getFoldSplit({
        ...base,
        leading: { trailingWidth: 300 },
        paddingHorizontal: 0,
      }).leadingWidth
    ).toBe(669 - 24 - 300)

    expect(
      getFoldSplit({
        ...base,
        leading: { trailingWidth: 300 },
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

describe('fold pane', () => {
  it('fills the container while the display is flat', () => {
    expect(getFoldPane({ width: 669, divisions: [], rtl: false })).toBeNull()
    expect(
      getFoldPane({
        width: 669,
        divisions: [{ ...bookFold, active: false }],
        rtl: false,
      })
    ).toBeNull()
  })

  it('keeps to the leading side of a book fold', () => {
    expect(
      getFoldPane({ width: 669, divisions: [bookFold], rtl: false })
    ).toEqual({ left: 0, right: 669 - 314 })
  })

  it('keeps to the right of the fold in right-to-left layouts', () => {
    expect(
      getFoldPane({ width: 669, divisions: [bookFold], rtl: true })
    ).toEqual({ left: 314 + 40, right: 0 })
  })

  it('ignores a laptop-style fold', () => {
    expect(
      getFoldPane({
        width: 951,
        divisions: [{ x: 0, y: 314, width: 951, height: 40, active: true }],
        rtl: false,
      })
    ).toBeNull()
  })
})

describe('clamp to fold side', () => {
  const base = {
    width: 300,
    windowWidth: 951,
    divisions: [] as FoldDivision[],
    insets: { left: 0, right: 84 },
    margin: 12,
  }
  const fold = { x: 455.5, y: 0, width: 40, height: 669, active: true }

  it('keeps clear of the vertical bar', () => {
    expect(clampToFoldSide({ ...base, x: 640, anchorX: 900 })).toBe(
      951 - 84 - 12 - 300
    )
  })

  it('leaves content that fits alone', () => {
    expect(clampToFoldSide({ ...base, x: 100, anchorX: 120 })).toBe(100)
  })

  it('keeps to the side of the fold its anchor is on', () => {
    expect(
      clampToFoldSide({ ...base, divisions: [fold], x: 300, anchorX: 400 })
    ).toBe(455.5 - 12 - 300)
    expect(
      clampToFoldSide({ ...base, divisions: [fold], x: 300, anchorX: 520 })
    ).toBe(455.5 + 40 + 12)
  })

  it('ignores an inactive fold', () => {
    expect(
      clampToFoldSide({
        ...base,
        divisions: [{ ...fold, active: false }],
        x: 300,
        anchorX: 400,
      })
    ).toBe(300)
  })

  it('leaves content too wide for its side where it was', () => {
    expect(
      clampToFoldSide({
        ...base,
        width: 600,
        divisions: [fold],
        x: 100,
        anchorX: 400,
      })
    ).toBe(100)
  })
})

describe('fold column', () => {
  const pane = { left: 0, right: 951 - 455.5 }

  it('stays centered while the display is flat', () => {
    expect(
      getFoldColumn({ width: 951, pane: null, maxWidth: 720, rtl: false })
    ).toBeNull()
  })

  it('fills a pane narrower than the column', () => {
    expect(
      getFoldColumn({ width: 951, pane, maxWidth: 720, rtl: false })
    ).toEqual({ width: 456, start: 0 })
  })

  it('centers a narrower column in the pane', () => {
    expect(
      getFoldColumn({ width: 951, pane, maxWidth: 400, rtl: false })
    ).toEqual({ width: 400, start: 28 })
  })

  it('measures from the right in right-to-left layouts', () => {
    const rtlPane = { left: 455.5 + 40, right: 0 }
    expect(
      getFoldColumn({ width: 951, pane: rtlPane, maxWidth: 400, rtl: true })
    ).toEqual({ width: 400, start: 28 })
  })
})
