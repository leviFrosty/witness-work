import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

type Route = { key: string; name: string; params?: object }

const mocks = vi.hoisted(() => ({
  hasSidebar: false,
  routes: [] as Route[],
  dispatch: vi.fn(),
  rootDispatch: vi.fn(),
}))

vi.mock('@react-navigation/native', () => ({
  CommonActions: {
    reset: (state: object) => ({ type: 'RESET', payload: state }),
    navigate: (name: string, params?: object) => ({
      type: 'NAVIGATE',
      payload: { name, params },
    }),
  },
  useNavigation: () => ({
    getState: () => ({
      key: 'root',
      index: mocks.routes.length - 1,
      routes: mocks.routes,
    }),
    dispatch: mocks.dispatch,
  }),
  useRoute: () => ({ key: 'settings-menu' }),
}))
vi.mock('@/hooks/useAdaptiveLayout', () => ({
  default: () => ({ hasSidebar: mocks.hasSidebar }),
}))
vi.mock('@/features/settings/components/SettingsContents', () => ({
  default: 'SettingsContents',
}))
vi.mock('@/app/navigation/settingsDetailScreens', () => ({
  settingsDetailScreens: [{ name: 'Preferences' }, { name: 'Security' }],
}))
vi.mock('@/features/contacts/lib/linking', () => ({
  navigationRef: { isReady: () => true, dispatch: mocks.rootDispatch },
}))

const { default: SettingsMenuScreen } = await import('./SettingsMenuScreen')

const root = { key: 'root-tabs', name: 'Root' }
const menu = { key: 'settings-menu', name: 'SettingsMenu' }

beforeEach(() => {
  mocks.hasSidebar = false
  mocks.dispatch.mockReset()
  mocks.rootDispatch.mockReset()
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => run())
})

const render = () => act(() => void create(<SettingsMenuScreen />))

it('stays put while the window is too narrow for the sidebar', () => {
  mocks.routes = [root, menu]
  render()
  expect(mocks.dispatch).not.toHaveBeenCalled()
  expect(mocks.rootDispatch).not.toHaveBeenCalled()
})

it('moves the open settings page into the Settings tab when the sidebar fits', () => {
  mocks.hasSidebar = true
  mocks.routes = [
    root,
    menu,
    { key: 'prefs', name: 'Preferences', params: { from: 'list' } },
  ]
  render()
  expect(mocks.dispatch).toHaveBeenCalledWith({
    type: 'RESET',
    payload: expect.objectContaining({ index: 0, routes: [root] }),
  })
  expect(mocks.rootDispatch).toHaveBeenCalledWith({
    type: 'NAVIGATE',
    payload: {
      name: 'Root',
      params: {
        screen: 'Settings',
        params: { screen: 'Preferences', params: { from: 'list' } },
      },
    },
  })
})

it('opens the Settings tab as it is when only the list was open', () => {
  mocks.hasSidebar = true
  mocks.routes = [root, menu]
  render()
  expect(mocks.rootDispatch).toHaveBeenCalledWith({
    type: 'NAVIGATE',
    payload: {
      name: 'Root',
      params: { screen: 'Settings', params: undefined },
    },
  })
})

it('leaves other screens opened on top of Settings alone', () => {
  mocks.hasSidebar = true
  mocks.routes = [root, menu, { key: 'paywall', name: 'Paywall' }]
  render()
  expect(mocks.dispatch).not.toHaveBeenCalled()
  expect(mocks.rootDispatch).not.toHaveBeenCalled()
})
