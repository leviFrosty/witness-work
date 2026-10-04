import { describe, expect, it } from 'vitest'
import {
  clampSidebarWidth,
  getAdaptiveLayout,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '@/lib/sidebarLayout'

describe('adaptive sidebar layout', () => {
  it('uses the saved width and gives the remaining space to content', () => {
    expect(getAdaptiveLayout(1194, 1, 300, false)).toMatchObject({
      hasSidebar: true,
      sidebarVisible: true,
      sidebarCompact: false,
      sidebarWidth: 300,
      contentWidth: 894,
      isWide: true,
    })
  })

  it('keeps tablet routes eligible when hidden and restores the same width', () => {
    expect(getAdaptiveLayout(1194, 1, 112, true)).toMatchObject({
      hasSidebar: true,
      sidebarVisible: false,
      sidebarWidth: 0,
      contentWidth: 1194,
    })
    expect(getAdaptiveLayout(1194, 1, 112, false)).toMatchObject({
      sidebarVisible: true,
      sidebarCompact: true,
      sidebarWidth: 112,
    })
  })

  it.each([
    [88, true],
    [219, true],
    [220, false],
    [360, false],
  ])('shows compact navigation at width %s: %s', (width, compact) => {
    expect(getAdaptiveLayout(1194, 1, width, false).sidebarCompact).toBe(
      compact
    )
  })

  it.each([
    [999, 1],
    [834, 1],
    [1194, 1.31],
  ])(
    'returns to phone navigation at window %s and font scale %s',
    (width, fontScale) => {
      expect(getAdaptiveLayout(width, fontScale, 300, false)).toMatchObject({
        hasSidebar: false,
        sidebarVisible: false,
        sidebarWidth: 0,
        contentWidth: width,
      })
    }
  )

  it('preserves a usable content width at the smallest supported tablet window', () => {
    expect(
      getAdaptiveLayout(1000, 1, SIDEBAR_DEFAULT_WIDTH, false).isWide
    ).toBe(true)
    expect(getAdaptiveLayout(1000, 1, 2000, false).contentWidth).toBe(640)
  })

  it.each([
    [-200, SIDEBAR_MIN_WIDTH],
    [2000, SIDEBAR_MAX_WIDTH],
    [NaN, SIDEBAR_DEFAULT_WIDTH],
    [Infinity, SIDEBAR_DEFAULT_WIDTH],
    [241.6, 242],
  ])('bounds the width %s to %s', (width, expected) => {
    expect(clampSidebarWidth(width)).toBe(expected)
  })
})
