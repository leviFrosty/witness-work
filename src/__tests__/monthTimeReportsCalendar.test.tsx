import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DateData } from 'react-native-calendars'
import { describe, expect, it, vi } from 'vitest'

const calendar = vi.hoisted(() => ({
  onDayPress: undefined as ((day: DateData) => void) | undefined,
}))

vi.mock('react-native', () => ({ View: 'div' }))
vi.mock('react-native-calendars', () => ({
  Calendar: (props: { onDayPress: (day: DateData) => void }) => {
    calendar.onDayPress = props.onDayPress
    return null
  },
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fontSize: () => 16 }),
}))
vi.mock('@/hooks/useStartOfWeek', () => ({ default: () => 0 }))
vi.mock('@/components/CalendarDay', () => ({ default: () => null }))
vi.mock('@/stores/serviceReport', () => ({
  default: (selector: (state: object) => unknown) =>
    selector({ dayPlans: [], recurringPlans: [] }),
}))
vi.mock('@/features/service-reports/lib/monthCalendarMarkedDates', () => ({
  buildMonthCalendarMarkedDates: () => ({}),
}))

import MonthTimeReportsCalendar from '@/features/service-reports/components/MonthTimeReportsCalendar'

const dateData = (dateString: string): DateData => {
  const [year, month, day] = dateString.split('-').map(Number)
  return { year, month, day, dateString, timestamp: Date.parse(dateString) }
}

describe('month calendar selection', () => {
  it('ignores adjacent-month cells, including the same month in a different year', () => {
    const setSheet = vi.fn()
    renderToStaticMarkup(
      createElement(MonthTimeReportsCalendar, {
        month: 0,
        year: 2026,
        monthsReports: [],
        selectedDate: new Date(2026, 0, 15),
        setSheet,
      })
    )

    for (const date of ['2025-12-31', '2026-02-01', '2025-01-15']) {
      calendar.onDayPress?.(dateData(date))
    }
    expect(setSheet).not.toHaveBeenCalled()

    calendar.onDayPress?.(dateData('2026-01-20'))
    expect(setSheet).toHaveBeenCalledExactlyOnceWith({
      open: true,
      date: new Date(2026, 0, 20),
    })
  })
})
