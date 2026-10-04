import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 1194, fontScale: 1 }),
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))

import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { useSidebarPreferences, useSidebarResize } from '@/stores/sidebar'

describe('live sidebar layout subscriptions', () => {
  let renderer: ReactTestRenderer | undefined
  afterEach(() => act(() => renderer?.unmount()))

  it('resizes navigation live without rebuilding screen navigators and sheet portals on each frame', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useSidebarPreferences.setState({ width: 240, hidden: false })
    useSidebarResize.getState().preview(null)
    const screenWidths: number[] = []
    const navigationWidths: number[] = []

    function ScreenLayout() {
      screenWidths.push(useAdaptiveLayout().sidebarWidth)
      return null
    }
    function NavigationLayout() {
      navigationWidths.push(
        useAdaptiveLayout({ liveResize: true }).sidebarWidth
      )
      return null
    }

    act(() => {
      renderer = create(
        <>
          <ScreenLayout />
          <NavigationLayout />
        </>
      )
    })
    act(() => useSidebarResize.getState().preview(160))
    act(() => useSidebarResize.getState().preview(112))
    expect(screenWidths).toEqual([240])
    expect(navigationWidths).toEqual([240, 160, 112])

    act(() => {
      useSidebarPreferences.getState().setWidth(112)
      useSidebarResize.getState().preview(null)
    })
    expect(screenWidths).toEqual([240, 112])
    expect(navigationWidths.at(-1)).toBe(112)
  })
})
