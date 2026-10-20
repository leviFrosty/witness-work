import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'

import type { DayPlan } from '@/types/timeEntry'
import type { UndoToast } from '@/stores/undoToast'

const navigate = vi.hoisted(() => vi.fn())
const publisher = vi.hoisted(() => ({ showsTimeEntry: true }))
const capture = vi.hoisted(() => vi.fn())
const alert = vi.hoisted(() => vi.fn())
const toasts = vi.hoisted(() => [] as Omit<UndoToast, 'id'>[])
const report = vi.hoisted(() => {
  const state = {
    dayPlans: [] as DayPlan[],
    recurringPlans: [],
    addDayPlan: (plan: DayPlan) => {
      state.dayPlans = [...state.dayPlans, plan]
    },
    deleteDayPlan: (id: string) => {
      state.dayPlans = state.dayPlans.filter((plan) => plan.id !== id)
    },
  }
  return state
})

vi.mock('react-native', () => ({ Alert: { alert } }))
vi.mock('expo-crypto', () => {
  let n = 0
  return { randomUUID: () => `copy-${++n}` }
})
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate }),
}))
vi.mock('@/hooks/usePublisher', () => ({ default: () => publisher }))
vi.mock('@/hooks/useStartOfWeek', () => ({ default: () => 0 }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/hooks/useFeatureAccess', () => ({
  default: () => ({ hasAccess: true }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))
vi.mock('@/lib/userAction', () => ({ noteUserAction: vi.fn() }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({ offDays: [] }) },
}))
vi.mock('@/stores/serviceReport', () => ({
  default: { getState: () => report },
}))
vi.mock('@/stores/undoToast', () => ({
  showUndoToast: (toast: Omit<UndoToast, 'id'>) => toasts.push(toast),
}))

import useDayMenuActions from '@/hooks/useDayMenuActions'
import { normalizeDateForStorage } from '@/lib/normalizeDate'

type Entries = ReturnType<typeof useDayMenuActions>

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  navigate.mockClear()
  publisher.showsTimeEntry = true
  capture.mockClear()
  alert.mockClear()
  toasts.length = 0
  report.dayPlans = []
  vi.useRealTimers()
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

/** The week-level action, in its own group after the day's. */
const copyAction = (menu: Entries) =>
  menu
    .flatMap((entry) => (Array.isArray(entry) ? entry : []))
    .find(
      (entry) =>
        entry && typeof entry === 'object' && entry.id === 'copy_last_week'
    )

const press = (menu: Entries) => {
  const action = copyAction(menu)
  if (action && 'onPress' in action) action.onPress()
}

const plan = (day: number, overrides: Partial<DayPlan> = {}): DayPlan => ({
  id: `source-${day}`,
  date: normalizeDateForStorage(new Date(2026, 9, day, 12)),
  minutes: 120,
  startTimeInMinutes: 540,
  ...overrides,
})

// Wednesday, October 21, 2026; weeks start on Sunday.
const wednesday = () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10))
}

it("offers Copy Last Week's Plans until the week's last day has passed", () => {
  wednesday()
  expect(copyAction(menuFor(new Date(2026, 9, 18)))).toBeTruthy()
  expect(copyAction(menuFor(new Date(2026, 9, 31)))).toBeTruthy()
  expect(copyAction(menuFor(new Date(2026, 9, 17)))).toBeFalsy()
})

it('copies last week onto the days ahead, and Undo removes only the copies', () => {
  wednesday()
  report.dayPlans = [
    plan(13),
    plan(15, { title: 'Cart witnessing', buddies: ['inbox-1'] }),
    plan(17),
    plan(24, { id: 'own', startTimeInMinutes: 600 }),
  ]
  press(menuFor(new Date(2026, 9, 22)))

  // Tuesday the 20th has passed.
  expect(report.dayPlans.map((p) => p.id)).toEqual([
    'source-13',
    'source-15',
    'source-17',
    'own',
    'copy-1',
    'copy-2',
  ])
  expect(report.dayPlans[4]).toMatchObject({
    title: 'Cart witnessing',
    startTimeInMinutes: 540,
  })
  expect(report.dayPlans[4].buddies).toBeUndefined()
  expect(capture).toHaveBeenCalledWith('plans_copied_from_last_week', {
    count: '2-3',
  })
  expect(toasts).toHaveLength(1)
  expect(toasts[0].message).toBe('copyLastWeekPlans_copied')

  report.addDayPlan(plan(23, { id: 'added-meanwhile' }))
  toasts[0].onUndo()
  expect(report.dayPlans.map((p) => p.id)).toEqual([
    'source-13',
    'source-15',
    'source-17',
    'own',
    'added-meanwhile',
  ])
})

it('says so and changes nothing when nothing is left to copy', () => {
  wednesday()
  report.dayPlans = [plan(13), plan(20)]
  press(menuFor(new Date(2026, 9, 21)))
  expect(report.dayPlans).toHaveLength(2)
  expect(alert).toHaveBeenCalledWith(
    'copyLastWeekPlans_noneTitle',
    'copyLastWeekPlans_noneMessage'
  )
  expect(capture).not.toHaveBeenCalled()
  expect(toasts).toEqual([])
})
