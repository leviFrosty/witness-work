import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'

const navigate = vi.hoisted(() => vi.fn())
const publisher = vi.hoisted(() => ({ showsTimeEntry: true }))

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate }),
}))
vi.mock('@/hooks/usePublisher', () => ({ default: () => publisher }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/hooks/useFeatureAccess', () => ({
  default: () => ({ hasAccess: true }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))

import useDayMenuActions from '@/hooks/useDayMenuActions'

type Entries = ReturnType<typeof useDayMenuActions>

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  navigate.mockClear()
  publisher.showsTimeEntry = true
})

const menuFor = (date: Date | undefined): Entries => {
  const Harness = () =>
    React.createElement('Menu', { actions: useDayMenuActions(date) })
  act(() => {
    renderer = create(<Harness />)
  })
  return renderer!.root.findByType('Menu' as never).props.actions
}

const ids = (menu: Entries) =>
  menu.flatMap((entry) =>
    entry && typeof entry === 'object' && 'id' in entry ? [entry.id] : []
  )

const dayOffset = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

it.each([-400, -1])(
  'offers Add Time and Plan This Day for a day %i days from today',
  (days) => {
    expect(ids(menuFor(dayOffset(days)))).toEqual(['add_time', 'plan_day'])
  }
)

it.each([0, 1, 30, 800])(
  'also offers Plan Route for a day %i days from today',
  (days) => {
    expect(ids(menuFor(dayOffset(days)))).toEqual([
      'add_time',
      'plan_day',
      'plan_route',
    ])
  }
)

it('opens the route builder on the day', () => {
  const tomorrow = dayOffset(1)
  const planRoute = menuFor(tomorrow).find(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      'id' in entry &&
      entry.id === 'plan_route'
  )
  if (planRoute && 'onPress' in planRoute) planRoute.onPress?.()
  expect(navigate).toHaveBeenCalledWith('TodayRoute', {
    date: [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-'),
  })
})

it('opens Add Time on a future day', () => {
  const future = dayOffset(90)
  const menu = menuFor(future)
  const addTime = menu.find(
    (entry) => entry && typeof entry === 'object' && 'id' in entry
  )
  expect(addTime && 'onPress' in addTime).toBe(true)
  if (addTime && 'onPress' in addTime) addTime.onPress?.()
  expect(navigate).toHaveBeenCalledWith('Add Time', {
    date: future.toISOString(),
  })
})

it('leaves Add Time out for publishers who do not log hours', () => {
  publisher.showsTimeEntry = false
  expect(ids(menuFor(dayOffset(1)))).toEqual(['plan_day', 'plan_route'])
})
