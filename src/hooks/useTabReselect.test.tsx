import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (e: { defaultPrevented: boolean }) => void
type FakeNavigation = {
  focused: boolean
  state: { type: string; routes: { key: string }[] }
  parent?: FakeNavigation
  listeners: Listener[]
  getState: () => FakeNavigation['state']
  getParent: () => FakeNavigation | undefined
  isFocused: () => boolean
  addListener: (type: string, listener: Listener) => () => void
}

const { current } = vi.hoisted(() => ({
  current: {
    navigation: undefined as unknown,
    routeKey: '',
  },
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => current.navigation,
  useRoute: () => ({ key: current.routeKey }),
}))

import useTabReselect from '@/hooks/useTabReselect'

const fakeNavigation = (
  type: string,
  routes: string[],
  parent?: FakeNavigation
): FakeNavigation => {
  const navigation: FakeNavigation = {
    focused: true,
    state: { type, routes: routes.map((key) => ({ key })) },
    parent,
    listeners: [],
    getState: () => navigation.state,
    getParent: () => navigation.parent,
    isFocused: () => navigation.focused,
    addListener: (event, listener) => {
      if (event === 'tabPress') navigation.listeners.push(listener)
      return () => {
        navigation.listeners = navigation.listeners.filter(
          (l) => l !== listener
        )
      }
    },
  }
  return navigation
}

const press = (tab: FakeNavigation, defaultPrevented = false) =>
  act(() => tab.listeners.forEach((listener) => listener({ defaultPrevented })))

let renderer: ReactTestRenderer
const onReselect = vi.fn()
function Screen() {
  useTabReselect(onReselect)
  return null
}
const render = () =>
  act(() => {
    renderer = create(<Screen />)
  })

beforeEach(() => {
  onReselect.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback()
    return 0
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  vi.unstubAllGlobals()
})

describe('useTabReselect', () => {
  it('runs on a tap of the tab already showing', () => {
    const tab = fakeNavigation('tab', ['Home', 'Schedule'])
    current.navigation = tab
    current.routeKey = 'Schedule'
    render()

    press(tab)

    expect(onReselect).toHaveBeenCalledTimes(1)
  })

  it('ignores the tap that switches to the tab', () => {
    const tab = fakeNavigation('tab', ['Home', 'Schedule'])
    tab.focused = false
    current.navigation = tab
    current.routeKey = 'Schedule'
    render()

    press(tab)

    expect(onReselect).not.toHaveBeenCalled()
  })

  it('ignores a press another listener prevented', () => {
    const tab = fakeNavigation('tab', ['Home'])
    current.navigation = tab
    current.routeKey = 'Home'
    render()

    press(tab, true)

    expect(onReselect).not.toHaveBeenCalled()
  })

  it('listens on the tab around a stack, from its first screen only', () => {
    const tab = fakeNavigation('tab', ['Home'])
    const stack = fakeNavigation('stack', ['Dashboard', 'Detail'], tab)
    current.navigation = stack
    current.routeKey = 'Dashboard'
    render()

    press(tab)
    expect(onReselect).toHaveBeenCalledTimes(1)

    act(() => renderer.unmount())
    current.routeKey = 'Detail'
    render()
    press(tab)
    expect(onReselect).toHaveBeenCalledTimes(1)
  })

  it('stops listening once unmounted', () => {
    const tab = fakeNavigation('tab', ['Home'])
    current.navigation = tab
    current.routeKey = 'Home'
    render()

    act(() => renderer.unmount())

    expect(tab.listeners).toHaveLength(0)
  })
})
