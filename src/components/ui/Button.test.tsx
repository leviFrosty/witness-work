import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { slot, flatten } = vi.hoisted(() => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style as Record<string, unknown>) ?? {})
  return {
    flatten,
    slot: (name: string) => (props: React.PropsWithChildren) =>
      React.createElement(name, props),
  }
})

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  View: 'View',
  StyleSheet: { flatten, absoluteFill: {} },
}))
vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: () => 'AnimatedPressable' },
  Easing: { in: () => undefined, quad: undefined },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
}))
vi.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isLiquidGlassAvailable: () => false,
}))
vi.mock('@/lib/haptics', () => ({ default: { light: vi.fn() } }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, numbers: { borderRadiusMd: 10 } }),
}))
vi.mock('@/hooks/useGlassColorScheme', () => ({ default: () => 'light' }))
vi.mock('@/lib/pointerHover', () => ({ supportsPointerEffects: true }))
vi.mock('@/components/ui/PointerHover', () => ({
  default: slot('PointerHover'),
  HoverTint: slot('HoverTint'),
}))

import Button, { type ButtonProps } from '@/components/ui/Button'

let root: ReactTestRenderer

afterEach(async () => {
  await act(async () => root.unmount())
})

const render = async (
  props: Pick<ButtonProps, 'style' | 'variant' | 'pointerEffect'>
) => {
  await act(async () => {
    root = create(<Button onPress={() => {}} {...props} />)
  })
}
const hover = () => root.root.findByType('PointerHover' as never)
const layout = (width: number, height: number) =>
  act(async () =>
    root.root
      .findByType('AnimatedPressable' as never)
      .props.onLayout({ nativeEvent: { layout: { width, height } } })
  )

describe('Button pointer effect', () => {
  it('highlights a small control on a clear background', async () => {
    await render({})
    expect(hover().props.effect).toBe('highlight')
  })

  it('lifts a small opaque control', async () => {
    await render({ style: { backgroundColor: '#08cc50' } })
    expect(hover().props.effect).toBe('lift')
  })

  it('highlights a translucent fill rather than lifting it', async () => {
    await render({ style: { backgroundColor: '#1BD15D33' } })
    expect(hover().props.effect).toBe('highlight')
  })

  it('tints a large surface instead of scaling it', async () => {
    await render({ variant: 'solid' })
    await layout(320, 64)
    expect(hover().props.effect).toBe('none')

    const tint = () => root.root.findByType('HoverTint' as never)
    expect(tint().props.visible).toBe(false)
    await act(async () => hover().props.onHoverChange(true))
    expect(tint().props.visible).toBe(true)
  })

  it('leaves hover to a parent when opted out', async () => {
    await render({ pointerEffect: 'none' })
    expect(root.root.findAllByType('PointerHover' as never)).toHaveLength(0)
  })

  it('gives disabled buttons no pointer feedback', async () => {
    await act(async () => {
      root = create(<Button onPress={() => {}} disabled />)
    })
    expect(root.root.findAllByType('PointerHover' as never)).toHaveLength(0)
  })

  it('gives inert buttons no pointer feedback', async () => {
    await act(async () => {
      root = create(<Button />)
    })
    expect(root.root.findAllByType('PointerHover' as never)).toHaveLength(0)
  })
})
