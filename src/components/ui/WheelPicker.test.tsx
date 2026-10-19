import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const a11y = vi.hoisted(() => ({
  listener: undefined as ((enabled: boolean) => void) | undefined,
}))

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isScreenReaderEnabled: () => Promise.resolve(false),
    addEventListener: (_event: string, listener: (on: boolean) => void) => {
      a11y.listener = listener
      return { remove: () => (a11y.listener = undefined) }
    },
  },
  Animated: { View: 'AnimatedView' },
  StyleSheet: { absoluteFill: {}, hairlineWidth: 1, create: <T,>(s: T) => s },
  Text: 'Text',
  TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  View: 'View',
}))
vi.mock('@quidone/react-native-wheel-picker', () => ({
  default: 'QuidoneWheelPicker',
  usePickerItemHeight: () => 43,
  useScrollContentOffset: () => ({ interpolate: () => 0 }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { text: '#text', border: '#border' } }),
}))

import WheelPicker from '@/components/ui/WheelPicker'

const data = [
  { value: 0, label: '0' },
  { value: 15, label: '15' },
  { value: 30, label: '30' },
]
let tree: ReactTestRenderer

const mount = async (value: number) => {
  const onValueChange = vi.fn()
  await act(async () => {
    tree = create(
      <WheelPicker
        data={data}
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel='Minutes'
        testID='wheel'
      />
    )
  })
  return onValueChange
}
const control = () => tree.root.findByProps({ accessibilityRole: 'adjustable' })
const rows = () => tree.root.findByType('QuidoneWheelPicker' as never).parent!
const a11yAction = (actionName: string) =>
  act(() =>
    control().props.onAccessibilityAction({ nativeEvent: { actionName } })
  )

afterEach(() => {
  act(() => tree.unmount())
})

describe('WheelPicker', () => {
  it('reads as one adjustable control with the selected row', async () => {
    await mount(15)
    expect(control().props).toMatchObject({
      accessible: true,
      accessibilityLabel: 'Minutes',
      accessibilityValue: { text: '15' },
      testID: 'wheel',
    })
  })

  it('moves one row per increment or decrement', async () => {
    const onValueChange = await mount(15)
    a11yAction('increment')
    a11yAction('decrement')
    expect(onValueChange.mock.calls).toEqual([[30], [0]])
  })

  it('stops at either end', async () => {
    const atEnd = await mount(30)
    a11yAction('increment')
    expect(atEnd).not.toHaveBeenCalled()
    act(() => tree.unmount())
    const atStart = await mount(0)
    a11yAction('decrement')
    a11yAction('activate')
    expect(atStart).not.toHaveBeenCalled()
  })

  it('hides the rows only while a screen reader runs', async () => {
    await mount(0)
    expect(rows().props.accessibilityElementsHidden).toBe(false)
    act(() => a11y.listener!(true))
    expect(rows().props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    })
  })
})
