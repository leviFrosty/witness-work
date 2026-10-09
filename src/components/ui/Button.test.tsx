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
  ActivityIndicator: 'ActivityIndicator',
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
  default: () => ({
    colors: { textAlt: '#999' },
    numbers: { borderRadiusMd: 10 },
  }),
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

describe('Button loading', () => {
  const press = vi.fn()
  const renderLoading = async (props: Partial<ButtonProps>) => {
    await act(async () => {
      root = create(
        <Button onPress={press} {...props}>
          {React.createElement('Label')}
        </Button>
      )
    })
  }
  const pressable = (type = 'AnimatedPressable') =>
    root.root.findByType(type as never)

  it('shows a spinner over the content, which keeps its size', async () => {
    await renderLoading({
      loading: true,
      loadingColor: '#fff',
      style: { flexDirection: 'row', gap: 6 },
    })
    expect(root.root.findByType('ActivityIndicator' as never).props.color).toBe(
      '#fff'
    )
    const label = root.root.findByType('Label' as never)
    expect(flatten(label.parent?.props.style)).toMatchObject({
      flexDirection: 'row',
      gap: 6,
      opacity: 0,
    })
  })

  it('cannot be pressed and reads as busy', async () => {
    await renderLoading({
      loading: true,
      accessibilityState: { selected: true },
    })
    expect(pressable().props.disabled).toBe(true)
    expect(pressable().props.accessibilityState).toEqual({
      selected: true,
      busy: true,
    })
    expect(root.root.findAllByType('PointerHover' as never)).toHaveLength(0)
  })

  it('keeps its name from the hidden label text', async () => {
    await act(async () => {
      root = create(
        <Button onPress={press} loading>
          {React.createElement('Text', null, 'Become a Supporter')}
        </Button>
      )
    })
    expect(pressable().props.accessibilityLabel).toBe('Become a Supporter')
    await renderLoading({ loading: true, accessibilityLabel: 'Refresh' })
    expect(pressable().props.accessibilityLabel).toBe('Refresh')
  })

  it('works on the plain variant too', async () => {
    await renderLoading({ loading: true, noTransform: true })
    expect(pressable('Pressable').props.disabled).toBe(true)
    expect(pressable('Pressable').props.accessibilityState).toEqual({
      busy: true,
    })
    expect(root.root.findAllByType('ActivityIndicator' as never)).toHaveLength(
      1
    )
  })

  it('renders normally when not loading', async () => {
    await renderLoading({ loading: false })
    expect(pressable().props.disabled).toBeFalsy()
    expect(pressable().props.accessibilityState).toBeUndefined()
    expect(root.root.findAllByType('ActivityIndicator' as never)).toHaveLength(
      0
    )
  })
})
