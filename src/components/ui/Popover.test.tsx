import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { slot, blur, hold, tooltip } = vi.hoisted(() => ({
  slot: (name: string) => (props: React.PropsWithChildren) =>
    React.createElement(name, props),
  blur: { listener: null as (() => void) | null },
  hold: vi.fn(),
  tooltip: {
    show: vi.fn(),

    dismiss: vi.fn(() => Promise.reject(new Error('No handler registered'))),
  },
}))

vi.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  Pressable: 'Pressable',
  Keyboard: { isVisible: () => false, dismiss: vi.fn(), addListener: vi.fn() },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener: (_event: 'blur', listener: () => void) => {
      blur.listener = listener
      return () => {}
    },
  }),
}))
vi.mock('@/hooks/useTakeoverTurn', () => ({ useTakeoverHold: hold }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => 'dark',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { card: '#card', text: '#text', textAlt: '#alt' },
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('lucide-react-native', () => ({ Info: 'Info' }))
vi.mock('@expo/ui', () => ({ Host: 'Host' }))
vi.mock('@expo/ui/swift-ui', () => ({
  Popover: Object.assign(slot('SwiftPopover'), {
    Trigger: slot('Trigger'),
    Content: slot('Content'),
  }),
  Group: 'Group',
  RNHostView: 'RNHostView',
  Text: 'SwiftText',
  VStack: 'VStack',
}))
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  onDisappear: (handler: () => void) => ({ onDisappear: handler }),
  presentationBackground: (color: string) => ({ background: color }),
  accessibilityAddTraits: () => ({}),
  fixedSize: () => ({}),
  font: () => ({}),
  frame: () => ({}),
  padding: () => ({}),
}))
vi.mock('@expo/ui/jetpack-compose', () => ({
  DropdownMenu: Object.assign(slot('DropdownMenu'), {
    Trigger: slot('Trigger'),
    Items: slot('Items'),
  }),
  RNHostView: 'RNHostView',
  Text: 'ComposeText',
  TooltipBox: Object.assign(slot('TooltipBox'), {
    RichTooltip: Object.assign(slot('RichTooltip'), {
      Title: slot('Title'),
      Text: slot('TooltipText'),
    }),
  }),
}))

import AndroidPopover from '@/components/ui/Popover.android'
import IOSPopover from '@/components/ui/Popover.ios'
import AndroidInfoPopover from '@/components/ui/InfoPopover.android'
import IOSInfoPopover from '@/components/ui/InfoPopover.ios'
import type { PopoverControls } from '@/components/ui/Popover.types'
import { Pressable, View } from 'react-native'

let root: ReactTestRenderer

beforeEach(() => vi.useFakeTimers())

afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  vi.clearAllMocks()
  blur.listener = null
})

const render = async (element: React.ReactElement) => {
  await act(async () => {
    root = create(element, {
      createNodeMock: (node) =>
        (node.type as unknown) === 'TooltipBox'
          ? tooltip
          : {
              measureInWindow: (
                callback: (x: number, y: number, w: number, h: number) => void
              ) => callback(0, 100, 44, 44),
            },
    })
  })
}

const press = async () =>
  act(async () => root.root.findByType('Pressable' as never).props.onPress())

const content = () =>
  root.root.findAll(
    (node) =>
      (node.type as unknown) === 'View' && node.props.testID === 'content'
  )

let controls: PopoverControls
const popover = (Popover: typeof IOSPopover) => (
  <Popover
    contentWidth={280}
    renderTrigger={({ onPress }) => <Pressable onPress={onPress} />}
  >
    {(next) => {
      controls = next
      return <View testID='content' />
    }}
  </Popover>
)

const open = async () => {
  await press()

  const viewport = root.root.find(
    (node) => (node.type as unknown) === 'View' && 'onLayout' in node.props
  )
  await act(async () => viewport.props.onLayout())
}

describe('iOS popover', () => {
  const swift = () => root.root.findByType('SwiftPopover' as never)
  const disappear = () =>
    root.root
      .findByType('Group' as never)
      .props.modifiers.find(
        (modifier: { onDisappear?: () => void }) => modifier.onDisappear
      ).onDisappear as () => void

  it('mounts the content on press and presents once it has laid out', async () => {
    await render(popover(IOSPopover))
    expect(content()).toHaveLength(0)
    expect(swift().props.isPresented).toBe(false)

    await press()
    expect(content()).not.toHaveLength(0)
    expect(swift().props.isPresented).toBe(false)
    expect(hold).toHaveBeenLastCalledWith(expect.any(String), true)

    await open()
    expect(swift().props.isPresented).toBe(true)

    expect(
      root.root.findByType('ScrollView' as never).props.style.maxHeight
    ).toBe(626)
  })

  it('runs closeThen actions only once the popover has disappeared', async () => {
    const action = vi.fn()
    await render(popover(IOSPopover))
    await open()

    await act(async () => controls.closeThen(action))
    expect(swift().props.isPresented).toBe(false)
    expect(action).not.toHaveBeenCalled()
    expect(content()).not.toHaveLength(0)

    await act(async () => disappear()())
    expect(action).toHaveBeenCalledOnce()
    expect(content()).toHaveLength(0)
    expect(hold).toHaveBeenLastCalledWith(expect.any(String), false)
  })

  it('closes on a tap outside and when its screen loses focus', async () => {
    await render(popover(IOSPopover))
    await open()
    await act(async () => swift().props.onIsPresentedChange(false))
    expect(swift().props.isPresented).toBe(false)
    await act(async () => disappear()())

    await open()
    await act(async () => blur.listener?.())
    expect(swift().props.isPresented).toBe(false)
  })

  it('reopens when the trigger is tapped while it is closing', async () => {
    await render(popover(IOSPopover))
    await open()
    await act(async () => controls.close())
    await press()
    await act(async () => disappear()())
    expect(swift().props.isPresented).toBe(true)
    expect(content()).not.toHaveLength(0)
  })
})

describe('Android popover', () => {
  const menu = () => root.root.findByType('DropdownMenu' as never)

  it('expands the menu surface and settles closeThen after its exit', async () => {
    const action = vi.fn()
    await render(popover(AndroidPopover))
    await open()
    expect(menu().props.expanded).toBe(true)
    expect(menu().props.color).toBe('#card')

    await act(async () => controls.closeThen(action))
    expect(menu().props.expanded).toBe(false)
    expect(action).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(action).toHaveBeenCalledOnce()
    expect(content()).toHaveLength(0)
  })

  it('closes on a tap outside or Back', async () => {
    await render(popover(AndroidPopover))
    await open()
    await act(async () => menu().props.onDismissRequest())
    expect(menu().props.expanded).toBe(false)
  })
})

describe('InfoPopover', () => {
  const texts = (type: string) =>
    root.root.findAllByType(type as never).map((node) => node.props.children)

  it('presents a SwiftUI popover of native text on iOS', async () => {
    await render(
      <IOSInfoPopover title='Goal' description='Hours to aim for.' />
    )
    const swift = () => root.root.findByType('SwiftPopover' as never)
    expect(texts('SwiftText')).toEqual(['Goal', 'Hours to aim for.'])
    expect(swift().props.isPresented).toBe(false)

    await press()
    expect(swift().props.isPresented).toBe(true)
    const trigger = root.root.findByType('Pressable' as never)
    expect(trigger.props.accessibilityState).toEqual({ expanded: true })

    await act(async () => blur.listener?.())
    expect(swift().props.isPresented).toBe(false)
  })

  it('shows a persistent Material rich tooltip on Android', async () => {
    await render(
      <AndroidInfoPopover title='Goal' description='Hours to aim for.' />
    )
    const box = root.root.findByType('TooltipBox' as never)
    expect(box.props.isPersistent).toBe(true)
    expect(box.props.enableUserInput).toBe(false)
    expect(texts('ComposeText')).toEqual(['Goal', 'Hours to aim for.'])

    await press()
    expect(tooltip.show).toHaveBeenCalledOnce()
    await act(async () => blur.listener?.())
    expect(tooltip.dismiss).toHaveBeenCalledOnce()
  })
})
