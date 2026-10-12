import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type {
  NavigationHelpers,
  ParamListBase,
  TabNavigationState,
} from '@react-navigation/native'
import type { NativeBottomTabNavigationEventMap } from '@react-navigation/bottom-tabs/unstable'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  focused: true,
  supported: true,
  shortcut: undefined as undefined | ((event: { input: string }) => void),
  configure: vi.fn(async () => true),
  remove: vi.fn(),
  captureException: vi.fn(),
}))
vi.mock('@react-navigation/native', () => ({
  useIsFocused: () => runtime.focused,
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: runtime.captureException },
}))
vi.mock('../../../modules/system-menu', () => ({
  get supportsNavigationShortcuts() {
    return runtime.supported
  },
  configureNavigationShortcuts: runtime.configure,
  subscribeToNavigationShortcut: (callback: typeof runtime.shortcut) => {
    runtime.shortcut = callback
    return { remove: runtime.remove }
  },
}))

import TabShortcuts from './TabShortcuts'

const ACTIONS = ['QuickAction']

let renderer: ReactTestRenderer | undefined
const makeState = (
  names = ['Home', 'Schedule', 'Contacts', 'Progress', 'QuickAction'],
  index = 0
): TabNavigationState<ParamListBase> => ({
  stale: false,
  type: 'tab',
  key: 'tabs',
  index,
  routeNames: names,
  routes: names.map((name) => ({ name, key: name })),
  history: [],
  preloadedRouteKeys: [],
})
const makeNavigation = () =>
  ({
    emit: vi.fn(),
    navigate: vi.fn(),
  }) as unknown as NavigationHelpers<
    ParamListBase,
    NativeBottomTabNavigationEventMap
  >
const mount = async (
  state: TabNavigationState<ParamListBase>,
  navigation: ReturnType<typeof makeNavigation>
) => {
  await act(async () => {
    renderer = create(
      <TabShortcuts state={state} navigation={navigation} actions={ACTIONS} />
    )
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  runtime.focused = true
  runtime.supported = true
  runtime.shortcut = undefined
})
afterEach(async () => {
  await act(async () => renderer?.unmount())
  renderer = undefined
})

it('numbers the destinations but not Quick Action', async () => {
  const navigation = makeNavigation()
  await mount(makeState(), navigation)
  expect(runtime.configure).toHaveBeenLastCalledWith(['1', '2', '3', '4'])
  runtime.shortcut?.({ input: '3' })
  expect(navigation.emit).toHaveBeenCalledWith({
    type: 'tabPress',
    target: 'Contacts',
  })
  expect(navigation.navigate).toHaveBeenCalledWith('Contacts', undefined)
  runtime.shortcut?.({ input: '5' })
  expect(navigation.navigate).toHaveBeenCalledTimes(1)
})

it('renumbers visible destinations when optional Progress is absent', async () => {
  const navigation = makeNavigation()
  await mount(
    makeState(['Home', 'Schedule', 'Contacts', 'Settings', 'QuickAction']),
    navigation
  )
  runtime.shortcut?.({ input: '4' })
  expect(navigation.navigate).toHaveBeenCalledWith('Settings', undefined)
  runtime.shortcut?.({ input: '03' })
  expect(navigation.navigate).toHaveBeenCalledTimes(1)
})

it('tells the open tab it was picked again without navigating', async () => {
  const navigation = makeNavigation()
  await mount(makeState(undefined, 2), navigation)
  runtime.shortcut?.({ input: '3' })
  expect(navigation.emit).toHaveBeenCalledWith({
    type: 'tabPress',
    target: 'Contacts',
  })
  expect(navigation.navigate).not.toHaveBeenCalled()
})

it('turns shortcuts off while another root screen is open', async () => {
  const navigation = makeNavigation()
  const state = makeState()
  await mount(state, navigation)
  runtime.focused = false
  await act(async () =>
    renderer?.update(
      <TabShortcuts state={state} navigation={navigation} actions={ACTIONS} />
    )
  )
  expect(runtime.configure).toHaveBeenLastCalledWith([])
  runtime.shortcut?.({ input: '2' })
  expect(navigation.navigate).not.toHaveBeenCalled()
})

it('configures the native shortcuts once per set of destinations', async () => {
  const navigation = makeNavigation()
  await mount(makeState(), navigation)
  await act(async () =>
    renderer?.update(
      <TabShortcuts
        state={makeState(undefined, 2)}
        navigation={navigation}
        actions={ACTIONS}
      />
    )
  )
  expect(runtime.configure).toHaveBeenCalledTimes(1)
})

it('leaves navigation unchanged on unsupported builds', async () => {
  runtime.supported = false
  await mount(makeState(), makeNavigation())
  expect(runtime.configure).not.toHaveBeenCalled()
  expect(runtime.shortcut).toBeUndefined()
})
