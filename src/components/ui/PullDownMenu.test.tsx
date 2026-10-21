import React from 'react'
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { slot } = vi.hoisted(() => ({
  slot: (name: string) => (props: React.PropsWithChildren) =>
    React.createElement(name, props),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  View: 'View',
}))
vi.mock('lucide-react-native', () => ({ Ellipsis: 'Ellipsis' }))
vi.mock('@expo/ui', () => ({ Host: 'Host' }))
vi.mock('@expo/ui/swift-ui', () => ({
  Button: 'Button',
  Divider: 'Divider',
  // Renders a custom label (the trigger) into a slot of its own.
  Menu: ({
    label,
    children,
    ...props
  }: { label: React.ReactNode } & React.PropsWithChildren) =>
    typeof label === 'string'
      ? React.createElement('Menu', { label, ...props }, children)
      : React.createElement(
          'Menu',
          props,
          React.createElement('MenuLabel', null, label),
          children
        ),
  RNHostView: 'RNHostView',
  Toggle: 'Toggle',
}))
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityHint: (hint: string) => ({ accessibilityHint: hint }),
  accessibilityIdentifier: (id: string) => ({ accessibilityIdentifier: id }),
  accessibilityLabel: (label: string) => ({ accessibilityLabel: label }),
  accessibilityValue: (value: string) => ({ accessibilityValue: value }),
}))
vi.mock('@expo/ui/jetpack-compose', () => ({
  Column: 'Column',
  DropdownMenu: Object.assign(slot('DropdownMenu'), {
    Trigger: slot('Trigger'),
    Items: slot('Items'),
  }),
  DropdownMenuItem: Object.assign(slot('DropdownMenuItem'), {
    Text: slot('ItemText'),
    LeadingIcon: slot('LeadingIcon'),
    TrailingIcon: slot('TrailingIcon'),
  }),
  HorizontalDivider: 'HorizontalDivider',
  Icon: 'ComposeIcon',
  RNHostView: 'RNHostView',
  Spacer: 'Spacer',
  Text: 'ComposeText',
}))
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  selectable: (selected: boolean, onClick: () => void, role: string) => ({
    selected,
    onClick,
    role,
  }),
  selectableGroup: () => ({ selectableGroup: true }),
  size: (width: number, height: number) => ({ size: [width, height] }),
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {
      text: '#text',
      textAlt: '#alt',
      error: '#err',
      card: '#card',
      border: '#border',
    },
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (selector: (s: { colorScheme: string }) => unknown) =>
    selector({ colorScheme: 'dark' }),
}))
vi.mock('@/components/ui/PointerHover', () => ({
  default: ({ children }: { children: unknown }) => children,
  HoverTint: () => null,
}))

import IosPullDownMenu from '@/components/ui/PullDownMenu.ios'
import AndroidPullDownMenu from '@/components/ui/PullDownMenu.android'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'
import type { PullDownMenuProps } from '@/components/ui/PullDownMenu.types'

const noop = () => {}

// Contact Details' More menu: Share…, Edit | Dismiss For ▸, Archive.
const contactMore: ContextMenuEntries = [
  [
    {
      id: 'share',
      title: 'Share…',
      systemImage: 'square.and.arrow.up',
      onPress: noop,
    },
    { id: 'edit', title: 'Edit', systemImage: 'pencil', onPress: noop },
  ],
  [
    {
      id: 'dismiss',
      title: 'Dismiss For',
      systemImage: 'clock',
      actions: [
        { id: '1_week', title: '1 Week', onPress: noop },
        { id: '1_month', title: '1 Month', onPress: noop },
      ],
    },
    {
      id: 'archive',
      title: 'Archive',
      systemImage: 'archivebox',
      destructive: true,
      onPress: noop,
    },
  ],
]

let root: ReactTestRenderer

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  vi.unstubAllGlobals()
})

const render = async (
  Menu: (props: PullDownMenuProps) => React.ReactNode,
  props: Partial<PullDownMenuProps> = {}
) => {
  await act(async () => {
    root = create(
      <Menu actions={contactMore} accessibilityLabel='More' {...props} />
    )
  })
}

const all = (type: string) => root.root.findAllByType(type as never)

/** The SwiftUI menu's own items, in order: `[type, label]`. */
const swiftItems = (parent: ReactTestInstance): [string, string][] =>
  parent.children.flatMap((child) => {
    if (typeof child === 'string' || (child.type as unknown) === 'MenuLabel')
      return []
    if (typeof child.type === 'string')
      return [[child.type, child.props.label ?? '']]
    return swiftItems(child)
  })

describe('iOS PullDownMenu', () => {
  const menu = () => all('Menu')[0]

  it('keeps a submenu inside its group, between dividers', async () => {
    await render(IosPullDownMenu)
    expect(swiftItems(menu())).toEqual([
      ['Button', 'Share…'],
      ['Button', 'Edit'],
      ['Divider', ''],
      ['Menu', 'Dismiss For'],
      ['Button', 'Archive'],
    ])
    const dismiss = all('Menu')[1]
    expect(swiftItems(dismiss)).toEqual([
      ['Button', '1 Week'],
      ['Button', '1 Month'],
    ])
  })

  it('gives actions their SF Symbols and destructive role', async () => {
    await render(IosPullDownMenu)
    const [share, , week, , archive] = all('Button')
    expect(share.props.systemImage).toBe('square.and.arrow.up')
    expect(share.props.role).toBeUndefined()
    expect(all('Menu')[1].props.systemImage).toBe('clock')
    expect(archive.props).toMatchObject({
      systemImage: 'archivebox',
      role: 'destructive',
    })
    // No symbol, no image.
    expect(week.props.systemImage).toBeUndefined()
  })

  it('separates every group with a divider', async () => {
    await render(IosPullDownMenu, {
      actions: [
        [{ id: 'a', title: 'A', onPress: noop }],
        [{ id: 'b', title: 'B', onPress: noop }],
      ],
    })
    expect(swiftItems(menu())).toEqual([
      ['Button', 'A'],
      ['Divider', ''],
      ['Button', 'B'],
    ])
  })

  it('runs the chosen action, including from a submenu', async () => {
    const onPress = vi.fn()
    await render(IosPullDownMenu, {
      actions: [
        { id: 'top', title: 'Top', onPress },
        {
          id: 'more',
          title: 'More',
          actions: [{ id: 'nested', title: 'Nested', onPress }],
        },
      ],
    })
    const [top, nested] = all('Button')
    await act(async () => top.props.onPress())
    await act(async () => nested.props.onPress())
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it('checks the current choice with system toggles', async () => {
    const onPress = vi.fn()
    await render(IosPullDownMenu, {
      actions: [
        { id: 'a', title: 'A', checked: false, onPress },
        { id: 'b', title: 'B', checked: true, onPress: noop },
      ],
    })
    expect(all('Toggle').map((toggle) => toggle.props.isOn)).toEqual([
      false,
      true,
    ])
    await act(async () => all('Toggle')[0].props.onIsOnChange(true))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('makes the menu one labelled element and reports opening', async () => {
    const onOpen = vi.fn()
    await render(IosPullDownMenu, {
      accessibilityValue: 'Hybrid',
      accessibilityHint: 'Shows layers',
      testID: 'layers',
      onOpen,
    })
    expect(all('Host')[0].props.colorScheme).toBe('dark')
    expect(menu().props.modifiers).toEqual([
      { accessibilityLabel: 'More' },
      { accessibilityValue: 'Hybrid' },
      { accessibilityHint: 'Shows layers' },
      { accessibilityIdentifier: 'layers' },
    ])
    // The hosted trigger stays out of the way of the menu's own element.
    expect(all('View')[1].props.accessibilityElementsHidden).toBe(true)
    // Taps on the label reach React Native at the outer view.
    all('View')[0].props.onTouchStart()
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('renders nothing without visible actions', async () => {
    await render(IosPullDownMenu, { actions: [false, [null]] })
    expect(root.toJSON()).toBeNull()
  })

  it('frames the default ellipsis at 44pt without moving it', async () => {
    await render(IosPullDownMenu, { triggerSize: 16 })
    expect(all('Host')[0].props.style).toMatchObject({
      marginHorizontal: -14,
      marginVertical: -14,
    })
    expect(Object.assign({}, ...all('View')[1].props.style)).toMatchObject({
      width: 44,
      height: 44,
    })
  })

  it('leaves a custom trigger its own size', async () => {
    await render(IosPullDownMenu, { children: <></> })
    expect(all('Host')[0].props.style.marginVertical).toBeUndefined()
    expect(
      Object.assign({}, ...all('View')[1].props.style).height
    ).toBeUndefined()
  })
})

describe('Android PullDownMenu', () => {
  const dropdown = () => all('DropdownMenu')[0]
  const trigger = () => all('Pressable')[0]
  const items = () => all('DropdownMenuItem')
  const label = (item: ReactTestInstance) =>
    item.findByType('ComposeText' as never).props.children
  const leading = (item: ReactTestInstance) =>
    item.findAllByType('LeadingIcon' as never)[0]
  const leadingIcon = (item: ReactTestInstance) =>
    leading(item)?.findAllByType('ComposeIcon' as never)[0]?.props

  const open = async () => {
    await act(async () => trigger().props.onPress())
  }

  it('frames the default ellipsis without moving it', async () => {
    await render(AndroidPullDownMenu, { triggerSize: 20 })
    expect(all('Host')[0].props.style).toMatchObject({
      marginHorizontal: -12,
      marginVertical: -12,
    })
    const style = trigger().props.style({ pressed: false })
    expect(Object.assign({}, ...style.filter(Boolean))).toMatchObject({
      width: 44,
      height: 44,
    })
  })

  it('opens on tap and separates groups with dividers', async () => {
    const onOpen = vi.fn()
    await render(AndroidPullDownMenu, { onOpen, testID: 'more' })
    expect(dropdown().props.expanded).toBe(false)
    await open()
    expect(dropdown().props.expanded).toBe(true)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(trigger().props).toMatchObject({
      accessibilityLabel: 'More',
      accessibilityState: { expanded: true },
      pointerEvents: 'box-only',
      testID: 'more',
    })
    expect(items().map(label)).toEqual([
      'Share…',
      'Edit',
      'Dismiss For  ›',
      'Archive',
    ])
    expect(all('HorizontalDivider')).toHaveLength(1)
  })

  it('shows tinted drawable icons, destructive in red', async () => {
    await render(AndroidPullDownMenu)
    await open()
    const [share, , dismiss, archive] = items()
    expect(leadingIcon(share).source).toContain('ww_menu_share')
    expect(leadingIcon(share).tint).toBe('#text')
    expect(leadingIcon(dismiss).source).toContain('ww_menu_clock')
    expect(leadingIcon(archive)).toMatchObject({ tint: '#err' })
    expect(leadingIcon(archive).source).toContain('ww_menu_archive')
    expect(archive.props.elementColors.textColor).toBe('#err')
  })

  it('opens a submenu in place, goes back, and runs a nested action', async () => {
    const onPress = vi.fn()
    await render(AndroidPullDownMenu, {
      actions: [
        {
          id: 'more',
          title: 'More',
          actions: [{ id: 'nested', title: 'Nested', onPress }],
        },
      ],
    })
    await open()
    await act(async () => items()[0].props.onClick())
    expect(items().map(label)).toEqual(['‹  More', 'Nested'])
    await act(async () => items()[0].props.onClick())
    expect(items().map(label)).toEqual(['More  ›'])
    await act(async () => items()[0].props.onClick())
    await act(async () => items()[1].props.onClick())
    expect(onPress).toHaveBeenCalledOnce()
    expect(dropdown().props.expanded).toBe(false)
  })

  it('shows drawable icons for every avatar-menu action', async () => {
    const symbols = [
      'person.crop.circle',
      'gearshape',
      'heart',
      'questionmark.circle',
    ] as const
    await render(AndroidPullDownMenu, {
      actions: symbols.map((systemImage) => ({
        id: systemImage,
        title: systemImage,
        systemImage,
        onPress: noop,
      })),
    })
    await open()
    const sources = items().map((item) => leadingIcon(item).source)
    ;[
      'ww_menu_profile',
      'ww_menu_settings',
      'ww_menu_heart',
      'ww_menu_help',
    ].forEach((drawable, index) => expect(sources[index]).toContain(drawable))
  })

  it('omits unsupported Android symbols, including in submenus', async () => {
    await render(AndroidPullDownMenu, {
      actions: [
        {
          id: 'more',
          title: 'More',
          systemImage: 'clock',
          actions: [
            { id: 'edit', title: 'Edit', systemImage: 'pencil', onPress: noop },
            {
              id: 'custom',
              title: 'Custom',
              systemImage: 'ant',
              onPress: noop,
            },
          ],
        },
      ],
    })
    await open()
    await act(async () => items()[0].props.onClick())
    const [back, edit, custom] = items()
    expect(leadingIcon(edit).source).toContain('ww_menu_edit')
    expect(leadingIcon(custom)).toBeUndefined()
    // Items without an icon keep its space, so the labels line up.
    for (const item of [back, custom])
      expect(
        leading(item).findByType('Spacer' as never).props.modifiers
      ).toEqual([{ size: [24, 24] }])
  })

  it('leaves no icon space when nothing in the menu has an icon', async () => {
    await render(AndroidPullDownMenu, {
      actions: [{ id: 'plain', title: 'Plain', onPress: noop }],
    })
    await open()
    expect(leading(items()[0])).toBeUndefined()
  })

  it('marks the current choice as a selected radio item with a check', async () => {
    await render(AndroidPullDownMenu, {
      actions: [
        { id: 'a', title: 'A', checked: false, onPress: noop },
        { id: 'b', title: 'B', checked: true, onPress: noop },
      ],
    })
    await open()
    expect(all('Column')[0].props.modifiers).toEqual([
      { selectableGroup: true },
    ])
    expect(items().map((item) => item.props.modifiers[0])).toMatchObject([
      { selected: false, role: 'radioButton' },
      { selected: true, role: 'radioButton' },
    ])
    expect(items()[0].findAllByType('TrailingIcon' as never)).toHaveLength(0)
    expect(items()[1].findAllByType('TrailingIcon' as never)).toHaveLength(1)
  })
})
