import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  View: 'View',
}))
vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Rect: 'Rect',
  Stop: 'Stop',
}))

import PeekScrollView from '@/components/ui/PeekScrollView'

let root: ReactTestRenderer

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('PeekScrollView', () => {
  it('toggles edge fades without re-rendering during continuous mid-scroll', async () => {
    const onRender = vi.fn()
    const Probe = () => {
      onRender()
      return React.createElement('View')
    }

    await act(async () => {
      root = create(
        <PeekScrollView height={100} fadeColor='#000000'>
          <Probe />
        </PeekScrollView>
      )
    })

    const scrollView = () => root.root.findByType('ScrollView' as never)
    const fades = () => root.root.findAllByType('Svg' as never)

    expect(fades()).toHaveLength(0)

    await act(async () => {
      scrollView().props.onLayout({ nativeEvent: { layout: { height: 100 } } })
      scrollView().props.onContentSizeChange(200, 300)
    })
    expect(fades()).toHaveLength(1)

    await act(async () => {
      scrollView().props.onScroll({ nativeEvent: { contentOffset: { y: 40 } } })
    })
    expect(fades()).toHaveLength(2)

    const rendersBeforeMiddleScroll = onRender.mock.calls.length
    await act(async () => {
      scrollView().props.onScroll({ nativeEvent: { contentOffset: { y: 80 } } })
      scrollView().props.onScroll({
        nativeEvent: { contentOffset: { y: 120 } },
      })
      scrollView().props.onScroll({
        nativeEvent: { contentOffset: { y: 160 } },
      })
    })
    expect(onRender.mock.calls.length).toBe(rendersBeforeMiddleScroll)
    expect(fades()).toHaveLength(2)

    await act(async () => {
      scrollView().props.onScroll({
        nativeEvent: { contentOffset: { y: 200 } },
      })
    })
    expect(fades()).toHaveLength(1)
  })
})
