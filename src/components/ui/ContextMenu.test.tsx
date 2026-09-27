import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const haptics = vi.hoisted(() => ({ perform: vi.fn() }))

// Hoisted with the mocks; React is only read once a slot renders.
const { slot } = vi.hoisted(() => ({
  slot: (name: string) => (props: React.PropsWithChildren) =>
    React.createElement(name, props),
}))

vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }))
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: 'ComposeHost',
  RNHostView: 'RNHostView',
  Text: 'ComposeText',
  DropdownMenu: Object.assign(slot('DropdownMenu'), {
    Trigger: slot('Trigger'),
    Items: slot('Items'),
  }),
  DropdownMenuItem: Object.assign(slot('DropdownMenuItem'), {
    Text: slot('ItemText'),
  }),
}))
vi.mock('expo-haptics', () => ({
  AndroidHaptics: { Long_Press: 'long-press' },
  performAndroidHapticsAsync: haptics.perform,
}))
vi.mock('@expo/ui/swift-ui', () => ({
  Host: 'SwiftHost',
  RNHostView: 'RNHostView',
  Button: 'SwiftButton',
  ContextMenu: Object.assign(slot('ContextMenu'), {
    Trigger: slot('Trigger'),
    Items: slot('Items'),
    Preview: slot('Preview'),
  }),
}))
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  disabled: (value: boolean) => ({ $type: 'disabled', value }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { card: '#card', text: '#text', textAlt: '#alt', error: '#err' },
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ colorScheme: 'dark' }),
}))

import AndroidContextMenu from '@/components/ui/ContextMenu.android'
import IOSContextMenu from '@/components/ui/ContextMenu.ios'
import type { ContextMenuAction } from '@/components/ui/ContextMenu.types'

let root: ReactTestRenderer

afterEach(async () => {
  await act(async () => root.unmount())
  vi.clearAllMocks()
})

const actions = (): ContextMenuAction[] => [
  { id: 'pin', title: 'Pin', systemImage: 'pin', onPress: vi.fn() },
  { id: 'archive', title: 'Archive', disabled: true, onPress: vi.fn() },
  { id: 'delete', title: 'Delete', destructive: true, onPress: vi.fn() },
]

const render = async (element: React.ReactElement) => {
  await act(async () => {
    root = create(element)
  })
}

describe('Android context menu', () => {
  const menu = () => root.root.findByType('DropdownMenu' as never)
  const items = () => root.root.findAllByType('DropdownMenuItem' as never)
  const trigger = () => root.root.findByType('Pressable' as never)

  it('opens on long press, runs the chosen action, and closes', async () => {
    const onPress = vi.fn()
    const list = actions()
    await render(
      <AndroidContextMenu actions={list} onPress={onPress}>
        <React.Fragment />
      </AndroidContextMenu>
    )
    expect(menu().props.expanded).toBe(false)

    trigger().props.onPress()
    expect(onPress).toHaveBeenCalledOnce()
    expect(menu().props.expanded).toBe(false)

    await act(async () => trigger().props.onLongPress())
    expect(menu().props.expanded).toBe(true)
    expect(haptics.perform).toHaveBeenCalledWith('long-press')

    await act(async () => items()[2].props.onClick())
    expect(list[2].onPress).toHaveBeenCalledOnce()
    expect(menu().props.expanded).toBe(false)
  })

  it('closes on dismiss without running an action', async () => {
    const list = actions()
    await render(
      <AndroidContextMenu actions={list}>
        <React.Fragment />
      </AndroidContextMenu>
    )
    await act(async () => trigger().props.onLongPress())
    await act(async () => menu().props.onDismissRequest())
    expect(menu().props.expanded).toBe(false)
    list.forEach((action) => expect(action.onPress).not.toHaveBeenCalled())
  })

  it('styles destructive and disabled items from the theme', async () => {
    await render(
      <AndroidContextMenu actions={actions()}>
        <React.Fragment />
      </AndroidContextMenu>
    )
    const [pin, archive, remove] = items()
    expect(pin.props.elementColors.textColor).toBe('#text')
    expect(archive.props.enabled).toBe(false)
    expect(remove.props.elementColors.textColor).toBe('#err')
  })

  it('opens for screen readers through the long-press action', async () => {
    await render(
      <AndroidContextMenu actions={actions()}>
        <React.Fragment />
      </AndroidContextMenu>
    )
    await act(async () =>
      trigger().props.onAccessibilityAction({
        nativeEvent: { actionName: 'longpress' },
      })
    )
    expect(menu().props.expanded).toBe(true)
  })

  it('renders the content without a menu when there are no actions', async () => {
    const onPress = vi.fn()
    await render(
      <AndroidContextMenu actions={[]} onPress={onPress}>
        <React.Fragment />
      </AndroidContextMenu>
    )
    expect(root.root.findAllByType('DropdownMenu' as never)).toHaveLength(0)
    trigger().props.onPress()
    expect(onPress).toHaveBeenCalledOnce()
  })
})

describe('iOS context menu', () => {
  it('maps actions to native buttons and hosts the preview', async () => {
    const list = actions()
    await render(
      <IOSContextMenu actions={list} preview={<React.Fragment />}>
        <React.Fragment />
      </IOSContextMenu>
    )
    const buttons = root.root.findAllByType('SwiftButton' as never)
    expect(buttons.map((b) => b.props.label)).toEqual([
      'Pin',
      'Archive',
      'Delete',
    ])
    expect(buttons[0].props.systemImage).toBe('pin')
    expect(buttons[1].props.modifiers).toEqual([
      { $type: 'disabled', value: true },
    ])
    expect(buttons[2].props.role).toBe('destructive')
    expect(root.root.findAllByType('Preview' as never)).toHaveLength(1)
  })

  it('renders the content without a menu when there are no actions', async () => {
    await render(
      <IOSContextMenu actions={[]}>
        <React.Fragment />
      </IOSContextMenu>
    )
    expect(root.root.findAllByType('ContextMenu' as never)).toHaveLength(0)
  })
})
