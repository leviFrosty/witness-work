import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  focused: true,
  sidebar: true,
  sidebarVisible: true,
  supported: true,
  command: undefined as undefined | ((event: { pressed: boolean }) => void),
  shortcut: undefined as undefined | ((event: { input: string }) => void),
  configure: vi.fn(async () => true),
  remove: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}))
vi.mock('@react-navigation/native', () => ({
  useIsFocused: () => runtime.focused,
}))
vi.mock('@/hooks/useAdaptiveLayout', () => ({
  default: () => ({
    hasSidebar: runtime.sidebar,
    sidebarVisible: runtime.sidebarVisible,
  }),
}))
vi.mock('@/components/ui/TabBar', () => ({ default: () => null }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: runtime.captureException },
}))
vi.mock('../../../modules/system-menu', () => ({
  get supportsNavigationShortcuts() {
    return runtime.supported
  },
  configureNavigationShortcuts: runtime.configure,
  subscribeToCommandKey: (callback: typeof runtime.command) => {
    runtime.command = callback
    return { remove: runtime.remove }
  },
  subscribeToNavigationShortcut: (callback: typeof runtime.shortcut) => {
    runtime.shortcut = callback
    return { remove: runtime.remove }
  },
}))

import NavigationTabBar from './NavigationTabBar'
import TabBar from '@/components/ui/TabBar'

let renderer: ReactTestRenderer | undefined
const makeProps = (
  names = ['Home', 'Schedule', 'Contacts', 'Progress', 'Settings']
): BottomTabBarProps => ({
  state: {
    stale: false,
    type: 'tab',
    key: 'tabs',
    index: 0,
    routeNames: names,
    routes: names.map((name) => ({ name, key: name })),
    history: [],
    preloadedRouteKeys: [],
  },
  descriptors: {},
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  navigation: {
    emit: vi.fn(() => ({ defaultPrevented: false })),
    navigate: vi.fn(),
  } as unknown as BottomTabBarProps['navigation'],
})
const mount = async (props: BottomTabBarProps) => {
  await act(async () => {
    renderer = create(<NavigationTabBar {...props} />)
  })
}
const hints = () => renderer?.root.findByType(TabBar).props.shortcutHints

beforeEach(() => {
  vi.clearAllMocks()
  runtime.focused = true
  runtime.sidebar = true
  runtime.sidebarVisible = true
  runtime.supported = true
  runtime.command = undefined
  runtime.shortcut = undefined
})
afterEach(async () => {
  await act(async () => renderer?.unmount())
  renderer = undefined
})

it.each([true, false])(
  'reveals matching hints only while Command is held (sidebar: %s)',
  async (sidebar) => {
    runtime.sidebar = sidebar
    const props = makeProps(
      sidebar ? undefined : ['Home', 'Schedule', 'Contacts']
    )
    await mount(props)
    expect(hints()).toBeUndefined()
    await act(async () => runtime.command?.({ pressed: true }))
    expect(hints()).toEqual(
      Object.fromEntries(
        props.state.routes.map((route, index) => [route.key, String(index + 1)])
      )
    )
    expect(runtime.configure).toHaveBeenCalledTimes(1)
    runtime.shortcut?.({ input: '3' })
    expect(props.navigation.navigate).toHaveBeenCalledWith(
      'Contacts',
      undefined
    )
    await act(async () =>
      renderer?.update(
        <NavigationTabBar {...props} state={{ ...props.state, index: 2 }} />
      )
    )
    expect(hints()?.Contacts).toBe('3')
    expect(runtime.configure).toHaveBeenCalledTimes(1)
    await act(async () => runtime.command?.({ pressed: false }))
    expect(hints()).toBeUndefined()
  }
)

it('renumbers visible destinations when optional Progress is absent', async () => {
  const props = makeProps(['Home', 'Schedule', 'Contacts', 'Settings'])
  await mount(props)
  runtime.shortcut?.({ input: '4' })
  expect(props.navigation.navigate).toHaveBeenCalledWith('Settings', undefined)
  runtime.shortcut?.({ input: '5' })
  runtime.shortcut?.({ input: '03' })
  expect(props.navigation.navigate).toHaveBeenCalledTimes(1)
})

it('respects prevented tab presses', async () => {
  const props = makeProps()
  vi.mocked(props.navigation.emit).mockReturnValue({
    type: 'tabPress',
    defaultPrevented: true,
  } as ReturnType<typeof props.navigation.emit>)
  await mount(props)
  runtime.shortcut?.({ input: '2' })
  expect(props.navigation.navigate).not.toHaveBeenCalled()
  expect(runtime.capture).toHaveBeenCalledWith(
    'navigation_shortcut_completed',
    {
      destination: 'Schedule',
      layout_variant: 'sidebar',
      outcome: 'prevented',
    }
  )
})

it('disables navigation and clears hints when another root screen is open', async () => {
  const props = makeProps()
  await mount(props)
  await act(async () => runtime.command?.({ pressed: true }))
  runtime.focused = false
  await act(async () => renderer?.update(<NavigationTabBar {...props} />))
  expect(runtime.configure).toHaveBeenLastCalledWith([])
  expect(hints()).toBeUndefined()
  runtime.shortcut?.({ input: '2' })
  expect(props.navigation.navigate).not.toHaveBeenCalled()
})

it('leaves navigation unchanged on unsupported builds', async () => {
  runtime.supported = false
  await mount(makeProps())
  expect(runtime.configure).not.toHaveBeenCalled()
  expect(runtime.command).toBeUndefined()
  expect(runtime.shortcut).toBeUndefined()
  expect(hints()).toBeUndefined()
})

it('keeps shortcuts working with a hidden sidebar without recording a hint reveal', async () => {
  runtime.sidebarVisible = false
  const props = makeProps()
  await mount(props)
  await act(async () => runtime.command?.({ pressed: true }))
  expect(hints()).toBeUndefined()
  expect(runtime.capture).not.toHaveBeenCalledWith(
    'navigation_shortcuts_revealed',
    expect.anything()
  )
  runtime.shortcut?.({ input: '3' })
  expect(props.navigation.navigate).toHaveBeenCalledWith('Contacts', undefined)
})
