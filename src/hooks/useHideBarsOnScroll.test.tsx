import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const layout = vi.hoisted(() => ({ isWide: false }))
vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 466, fontScale: 1 }),
}))
vi.mock('@react-navigation/native', () => ({ useIsFocused: () => true }))
vi.mock('@/hooks/useAdaptiveLayout', () => ({
  default: () => ({ isWide: layout.isWide, hasSidebar: false }),
}))
vi.mock('@/hooks/useHideTabBar', () => ({ default: () => {} }))
vi.mock('@/hooks/useScreenReaderEnabled', () => ({ default: () => false }))
vi.mock('@/hooks/useTabReselect', () => ({ default: () => {} }))

import useHideBarsOnScroll from '@/hooks/useHideBarsOnScroll'

type Bars = ReturnType<typeof useHideBarsOnScroll>

const frame = (y: number) =>
  ({
    nativeEvent: {
      contentOffset: { y },
      contentSize: { height: 3000 },
      layoutMeasurement: { height: 600 },
    },
  }) as never

describe('bars hidden by scrolling', () => {
  let renderer: ReactTestRenderer | undefined
  afterEach(() => {
    act(() => renderer?.unmount())
    layout.isWide = false
  })

  it('stay hidden after the window widens and narrows again', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const renders: Bars[] = []
    function Screen() {
      renders.push(useHideBarsOnScroll())
      return null
    }
    const bars = () => renders.at(-1)!
    act(() => {
      renderer = create(<Screen />)
    })

    // Swipe down through the content.
    act(() => bars().scrollProps.onScrollBeginDrag(frame(100)))
    act(() => bars().onScroll(frame(200)))
    expect(bars().hidden).toBe(true)

    // Opening iPhone Duo keeps the chrome; closing it puts things back.
    layout.isWide = true
    act(() => renderer!.update(<Screen />))
    expect(bars().hidden).toBe(false)
    layout.isWide = false
    act(() => renderer!.update(<Screen />))
    expect(bars().hidden).toBe(true)
  })

  it('stay hidden when the screen itself scrolls to the top while wide', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const renders: Bars[] = []
    function Screen() {
      renders.push(useHideBarsOnScroll())
      return null
    }
    const bars = () => renders.at(-1)!
    act(() => {
      renderer = create(<Screen />)
    })
    act(() => bars().scrollProps.onScrollBeginDrag(frame(100)))
    act(() => bars().onScroll(frame(200)))
    act(() => bars().scrollProps.onScrollEndDrag())
    layout.isWide = true
    act(() => renderer!.update(<Screen />))
    // Keeping its place in the wide layout lands it at the top.
    act(() => bars().onScroll(frame(0)))
    layout.isWide = false
    act(() => renderer!.update(<Screen />))
    expect(bars().hidden).toBe(true)
  })

  it('come back after scrolling to the top while wide', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const renders: Bars[] = []
    function Screen() {
      renders.push(useHideBarsOnScroll())
      return null
    }
    const bars = () => renders.at(-1)!
    act(() => {
      renderer = create(<Screen />)
    })
    act(() => bars().scrollProps.onScrollBeginDrag(frame(100)))
    act(() => bars().onScroll(frame(200)))
    layout.isWide = true
    act(() => renderer!.update(<Screen />))
    act(() => bars().scrollProps.onScrollBeginDrag(frame(200)))
    act(() => bars().onScroll(frame(0)))
    layout.isWide = false
    act(() => renderer!.update(<Screen />))
    expect(bars().hidden).toBe(false)
  })
})
