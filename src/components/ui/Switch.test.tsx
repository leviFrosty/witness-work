import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ View: 'View', Switch: 'NativeSwitch' }))
vi.mock('@expo/ui', () => ({ Host: 'Host' }))
vi.mock('@expo/ui/jetpack-compose', () => ({ Switch: 'ComposeSwitch' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {
      accent: '#accent',
      accentAlt: '#accentAlt',
      border: '#border',
      textAlt: '#textAlt',
      textInverse: '#textInverse',
    },
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: object) => unknown) =>
    select({ colorScheme: 'dark' }),
}))

import AndroidSwitch from '@/components/ui/Switch.android'

let renderer: ReactTestRenderer | undefined

function render(element: React.ReactElement) {
  act(() => {
    renderer = create(element)
  })
  return renderer!
}

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('Android Switch', () => {
  it('toggles through the Compose switch with the accent color', () => {
    const onValueChange = vi.fn()
    const tree = render(
      <AndroidSwitch
        value={false}
        onValueChange={onValueChange}
        accessibilityLabel='Notify me'
        testID='notify-switch'
      />
    )

    const host = tree.root.findByType('Host' as never)
    expect(host.props).toMatchObject({
      matchContents: true,
      colorScheme: 'dark',
    })

    const toggle = tree.root.findByType('ComposeSwitch' as never)
    expect(toggle.props).toMatchObject({
      value: false,
      enabled: true,
      colors: { checkedTrackColor: '#accent', uncheckedTrackColor: '#border' },
    })
    expect(tree.root.findByType('View' as never).props).toMatchObject({
      testID: 'notify-switch',
      pointerEvents: 'auto',
      accessible: true,
      accessibilityRole: 'switch',
      accessibilityLabel: 'Notify me',
      accessibilityState: { checked: false, disabled: false },
    })

    act(() => toggle.props.onCheckedChange(true))
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it('toggles from a TalkBack double tap', () => {
    const onValueChange = vi.fn()
    const tree = render(
      <AndroidSwitch
        value
        onValueChange={onValueChange}
        accessibilityLabel='Notify me'
      />
    )
    const view = tree.root.findByType('View' as never)
    act(() =>
      view.props.onAccessibilityAction({
        nativeEvent: { actionName: 'activate' },
      })
    )
    expect(onValueChange).toHaveBeenCalledWith(false)
  })

  it('disables the Compose switch and its TalkBack action', () => {
    const onValueChange = vi.fn()
    const tree = render(
      <AndroidSwitch
        value
        onValueChange={onValueChange}
        disabled
        accessibilityLabel='Notify me'
      />
    )
    expect(tree.root.findByType('ComposeSwitch' as never).props.enabled).toBe(
      false
    )
    const view = tree.root.findByType('View' as never)
    expect(view.props.accessibilityState).toEqual({
      checked: true,
      disabled: true,
    })
    act(() =>
      view.props.onAccessibilityAction({
        nativeEvent: { actionName: 'activate' },
      })
    )
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('leaves taps and TalkBack focus to the row for a display-only switch', () => {
    const tree = render(<AndroidSwitch value accessible={false} />)
    expect(tree.root.findByType('View' as never).props).toMatchObject({
      pointerEvents: 'none',
      accessible: false,
      importantForAccessibility: 'no-hide-descendants',
    })
  })
})
