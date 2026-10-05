import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const haptics = vi.hoisted(() => ({ perform: vi.fn() }))
const analytics = vi.hoisted(() => ({ capture: vi.fn() }))

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
  HorizontalDivider: 'HorizontalDivider',
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
  Divider: 'SwiftDivider',
  Menu: 'SwiftMenu',
  ContextMenu: Object.assign(slot('ContextMenu'), {
    Trigger: slot('Trigger'),
    Items: slot('Items'),
    Preview: slot('Preview'),
  }),
}))
vi.mock('@/lib/analytics', () => ({ analytics }))
vi.mock('@/components/ui/PointerHover', () => ({
  default: slot('PointerHover'),
  HoverTint: slot('HoverTint'),
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
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'

let root: ReactTestRenderer

afterEach(async () => {
  await act(async () => root.unmount())
  vi.clearAllMocks()
})

const pin = { id: 'pin', title: 'Pin', systemImage: 'pin' as const }
const archive = { id: 'archive', title: 'Archive' }
const remove = { id: 'delete', title: 'Delete', destructive: true }

const actions = () => [
  { ...pin, onPress: vi.fn() },
  { ...archive, onPress: vi.fn() },
  { ...remove, onPress: vi.fn() },
]

const render = async (element: React.ReactElement) => {
  await act(async () => {
    root = create(element)
  })
}

describe('Android context menu', () => {
  const menu = () => root.root.findByType('DropdownMenu' as never)
  const items = () => root.root.findAllByType('DropdownMenuItem' as never)
  const titles = () =>
    root.root.findAllByType('ComposeText' as never).map((t) => t.props.children)
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
    expect(analytics.capture).not.toHaveBeenCalled()
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

  it('hides falsy items, separates groups, and colors destructive items', async () => {
    const entries: ContextMenuEntries = [
      [{ ...pin, onPress: vi.fn() }, false, null],
      [{ ...remove, onPress: vi.fn() }],
    ]
    await render(
      <AndroidContextMenu actions={entries}>
        <React.Fragment />
      </AndroidContextMenu>
    )
    expect(titles()).toEqual(['Pin', 'Delete'])
    expect(root.root.findAllByType('HorizontalDivider' as never)).toHaveLength(
      1
    )
    expect(items()[0].props.elementColors.textColor).toBe('#text')
    expect(items()[1].props.elementColors.textColor).toBe('#err')
  })

  it('swaps in a submenu and runs its action under a prefixed key', async () => {
    const eachPlan = vi.fn()
    await render(
      <AndroidContextMenu
        actions={[
          {
            id: 'delete',
            title: 'Delete',
            actions: [
              { id: 'one', title: 'This plan', onPress: vi.fn() },
              { id: 'all', title: 'All plans', onPress: eachPlan },
            ],
          },
        ]}
      >
        <React.Fragment />
      </AndroidContextMenu>
    )
    await act(async () => trigger().props.onLongPress())
    await act(async () => items()[0].props.onClick())
    expect(titles()).toEqual(['‹  Delete', 'This plan', 'All plans'])
    await act(async () => items()[2].props.onClick())
    expect(eachPlan).toHaveBeenCalledOnce()
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('exposes every action to screen readers', async () => {
    const list = actions()
    await render(
      <AndroidContextMenu actions={list}>
        <React.Fragment />
      </AndroidContextMenu>
    )
    expect(
      trigger().props.accessibilityActions.map(
        (a: { label: string }) => a.label
      )
    ).toEqual(['Pin', 'Archive', 'Delete'])
    await act(async () =>
      trigger().props.onAccessibilityAction({
        nativeEvent: { actionName: 'archive' },
      })
    )
    expect(list[1].onPress).toHaveBeenCalledOnce()
  })

  it('renders the content without a menu when there are no actions', async () => {
    const onPress = vi.fn()
    await render(
      <AndroidContextMenu actions={[false]} onPress={onPress}>
        <React.Fragment />
      </AndroidContextMenu>
    )
    expect(root.root.findAllByType('DropdownMenu' as never)).toHaveLength(0)
    trigger().props.onPress()
    expect(onPress).toHaveBeenCalledOnce()
  })
})

describe('disabled context menu', () => {
  it('keeps the native host but opens nothing on Android', async () => {
    await render(
      <AndroidContextMenu actions={actions()} disabled>
        <React.Fragment />
      </AndroidContextMenu>
    )
    const trigger = root.root.findByType('Pressable' as never)
    expect(root.root.findAllByType('DropdownMenu' as never)).toHaveLength(1)
    expect(trigger.props.onLongPress).toBeUndefined()
    expect(trigger.props.accessibilityActions).toBeUndefined()
  })

  it('keeps the native host but offers no items on iOS', async () => {
    await render(
      <IOSContextMenu actions={actions()} preview={<React.Fragment />} disabled>
        <React.Fragment />
      </IOSContextMenu>
    )
    expect(root.root.findAllByType('ContextMenu' as never)).toHaveLength(1)
    expect(root.root.findAllByType('SwiftButton' as never)).toHaveLength(0)
    expect(root.root.findAllByType('Preview' as never)).toHaveLength(0)
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
    expect(buttons[2].props.role).toBe('destructive')
    expect(root.root.findAllByType('Preview' as never)).toHaveLength(1)

    buttons[0].props.onPress()
    expect(list[0].onPress).toHaveBeenCalledOnce()
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('renders groups with dividers and submenus as nested menus', async () => {
    await render(
      <IOSContextMenu
        actions={[
          [{ ...pin, onPress: vi.fn() }],
          [
            {
              id: 'delete',
              title: 'Delete',
              actions: [{ id: 'all', title: 'All', onPress: vi.fn() }],
            },
            { id: 'empty', title: 'Empty', actions: [] },
          ],
        ]}
      >
        <React.Fragment />
      </IOSContextMenu>
    )
    expect(root.root.findAllByType('SwiftDivider' as never)).toHaveLength(1)
    const menus = root.root.findAllByType('SwiftMenu' as never)
    expect(menus.map((m) => m.props.label)).toEqual(['Delete'])
  })

  it('mirrors actions as accessibility actions on the tappable trigger', async () => {
    const list = actions()
    await render(
      <IOSContextMenu actions={list} onPress={vi.fn()}>
        <React.Fragment />
      </IOSContextMenu>
    )
    const trigger = root.root.findByType('Pressable' as never)
    expect(trigger.props.accessibilityActions).toHaveLength(3)
    trigger.props.onAccessibilityAction({
      nativeEvent: { actionName: 'delete' },
    })
    expect(list[2].onPress).toHaveBeenCalledOnce()
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('renders the content without a menu when there are no actions', async () => {
    await render(
      <IOSContextMenu actions={[]}>
        <React.Fragment />
      </IOSContextMenu>
    )
    expect(root.root.findAllByType('ContextMenu' as never)).toHaveLength(0)
  })
  it('arms the preview and tints tappable content while a pointer hovers', async () => {
    await render(
      <IOSContextMenu
        actions={actions()}
        onPress={vi.fn()}
        preview={<PreviewContent />}
      >
        <React.Fragment />
      </IOSContextMenu>
    )
    const hover = () => root.root.findByType('PointerHover' as never)
    const tint = () => root.root.findByType('HoverTint' as never)
    expect(root.root.findAllByType(PreviewContent)).toHaveLength(0)
    expect(tint().props.visible).toBe(false)

    // A trackpad's secondary click never sends a touch to arm it.
    await act(async () => hover().props.onHoverChange(true))
    expect(root.root.findAllByType(PreviewContent)).toHaveLength(1)
    expect(tint().props.visible).toBe(true)

    await act(async () => hover().props.onHoverChange(false))
    expect(tint().props.visible).toBe(false)
    expect(root.root.findAllByType(PreviewContent)).toHaveLength(1)
  })

  it('leaves content without a tap action untinted', async () => {
    await render(
      <IOSContextMenu actions={actions()}>
        <React.Fragment />
      </IOSContextMenu>
    )
    const hover = root.root.findByType('PointerHover' as never)
    expect(hover.props.effect).toBe('none')
    await act(async () => hover.props.onHoverChange(true))
    expect(root.root.findByType('HoverTint' as never).props.visible).toBe(false)
  })
})

function PreviewContent() {
  return null
}
