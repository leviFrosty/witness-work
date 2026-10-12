import { describe, expect, it } from 'vitest'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'

describe('adaptive layout', () => {
  it('shows the native sidebar on wide iPad windows and gives content the rest', () => {
    expect(getAdaptiveLayout(1194, 1, true, 874)).toMatchObject({
      hasSidebar: true,
      contentWidth: 874,
      isWide: true,
    })
  })

  it('keeps Android tablets on the bottom tab bar', () => {
    expect(getAdaptiveLayout(1280, 1, false, 1280)).toMatchObject({
      hasSidebar: false,
      contentWidth: 1280,
      isWide: true,
    })
  })

  it.each([
    [999, 1],
    [834, 1],
    [1194, 1.31],
  ])(
    'returns to the tab bar at window %s and font scale %s',
    (width, fontScale) => {
      expect(getAdaptiveLayout(width, fontScale, true).hasSidebar).toBe(false)
    }
  )

  it('uses the window until a tab is measured, and never more than it', () => {
    expect(getAdaptiveLayout(1194, 1, true).contentWidth).toBe(1194)
    // A width measured before the window shrank (e.g. a rotation).
    expect(getAdaptiveLayout(834, 1, true, 1194).contentWidth).toBe(834)
  })

  it('lays content out compactly when the sidebar leaves too little room', () => {
    expect(getAdaptiveLayout(1032, 1, true, 712)).toMatchObject({
      hasSidebar: true,
      isWide: false,
    })
  })
})
