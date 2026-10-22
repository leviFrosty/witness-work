import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const popover = vi.hoisted(() => ({ show: vi.fn(), takingOver: false }))

vi.mock('react-native', () => ({
  View: 'View',
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}))
vi.mock('@/features/notifications/lib/appIconBadge', () => ({
  setAppIconBadge: () => {},
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('lucide-react-native', () => ({ Bell: 'Bell' }))
vi.mock('@/components/ui/Popover', () => ({
  default: ({
    renderTrigger,
  }: {
    renderTrigger: (props: { onPress: () => void }) => React.ReactNode
  }) => renderTrigger({ onPress: popover.show }),
}))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/PointerTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {} }),
}))
vi.mock('@/hooks/useTakeoverTurn', () => ({
  useIsTakingOver: () => popover.takingOver,
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/features/notifications/components/NotificationsList', () => ({
  default: () => null,
}))

import NotificationsTray from '@/features/notifications/components/NotificationsTray'
import {
  requestNotificationsTray,
  useNotificationsTray,
} from '@/features/notifications/stores/notificationsTray'

let renderer: ReactTestRenderer | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (run: () => void) =>
    setTimeout(run, 16)
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  popover.show.mockClear()
  popover.takingOver = false
  useNotificationsTray.setState({ openRequested: false })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const mount = () =>
  act(() => {
    renderer = create(<NotificationsTray items={[]} now={Date.now()} />)
  })

const layOutBell = () =>
  act(() => {
    const bell = renderer!.root.find(
      (node) =>
        (node.type as unknown) === 'View' &&
        typeof node.props.onLayout === 'function'
    )
    bell.props.onLayout({ nativeEvent: { layout: {} } })
  })

const frames = (count: number) =>
  act(() => {
    vi.advanceTimersByTime(16 * count)
  })

it('opens a tray requested at launch only once the bell has laid out', () => {
  requestNotificationsTray()
  mount()
  frames(4)
  expect(popover.show).not.toHaveBeenCalled()

  layOutBell()
  frames(1)
  expect(popover.show).not.toHaveBeenCalled()
  frames(1)
  expect(popover.show).toHaveBeenCalledTimes(1)
  expect(useNotificationsTray.getState().openRequested).toBe(false)
})

it('opens a tray requested while Home is up after two frames', () => {
  mount()
  layOutBell()
  act(() => requestNotificationsTray())
  frames(2)
  expect(popover.show).toHaveBeenCalledTimes(1)

  frames(4)
  expect(popover.show).toHaveBeenCalledTimes(1)
})

it('keeps the request while something takes over the screen', () => {
  popover.takingOver = true
  mount()
  layOutBell()
  act(() => requestNotificationsTray())
  frames(4)
  expect(popover.show).not.toHaveBeenCalled()
  expect(useNotificationsTray.getState().openRequested).toBe(true)
})
