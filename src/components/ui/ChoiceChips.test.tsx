import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false },
  Platform: { OS: 'ios' },
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
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {
      accent: '#3366cc',
      background: '#000000',
      border: '#333333',
      card: '#111111',
      text: '#ffffff',
    },
    fonts: { regular: 'Regular', semiBold: 'SemiBold' },
    fontSize: () => 14,
  }),
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))

import ChoiceChips from '@/components/ui/ChoiceChips'

let root: ReactTestRenderer

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('ChoiceChips scroll fades', () => {
  it('updates fades only when edge visibility changes', async () => {
    const options = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
    ] as const

    await act(async () => {
      root = create(
        <ChoiceChips
          layout='scroll'
          options={options}
          value='a'
          onChange={() => {}}
        />
      )
    })

    const scrollView = () => root.root.findByType('ScrollView' as never)
    const fades = () => root.root.findAllByType('Svg' as never)

    expect(fades()).toHaveLength(0)

    await act(async () => {
      scrollView().props.onLayout({ nativeEvent: { layout: { width: 100 } } })
      scrollView().props.onContentSizeChange(300)
    })
    expect(fades()).toHaveLength(1)

    await act(async () => {
      scrollView().props.onScroll({ nativeEvent: { contentOffset: { x: 50 } } })
    })
    expect(fades()).toHaveLength(2)

    const prevScrollViewProps = scrollView().props
    await act(async () => {
      scrollView().props.onScroll({
        nativeEvent: { contentOffset: { x: 100 } },
      })
      scrollView().props.onScroll({
        nativeEvent: { contentOffset: { x: 150 } },
      })
    })
    expect(scrollView().props).toBe(prevScrollViewProps)
    expect(fades()).toHaveLength(2)

    await act(async () => {
      scrollView().props.onScroll({
        nativeEvent: { contentOffset: { x: 200 } },
      })
    })
    expect(fades()).toHaveLength(1)
  })
})
