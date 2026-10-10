import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const zoom = vi.hoisted(() => ({
  setMonthFrame: () => {},
  setYearFrame: () => {},
  zoomTo: () => {},
  hold: () => {},
  release: () => {},
}))

vi.mock('react-native-reanimated', () => ({
  useSharedValue: (value: number) => ({ value, set: () => {} }),
}))
vi.mock('@/hooks/useStartOfWeek', () => ({ default: () => 0 }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: () => {} } }))
vi.mock('@/lib/haptics', () => ({
  default: { light: () => {}, selection: () => {} },
}))
vi.mock('@/features/plans/hooks/useScheduleZoom', () => ({
  default: () => zoom,
}))
vi.mock('@/features/plans/components/ScheduleMonthView', () => ({
  MONTH_GRID_PADDING: 8,
}))
vi.mock('@/features/plans/components/ScheduleMonthHeader', () => ({
  MONTH_HEADER_HEIGHT: 48,
}))
vi.mock('@/features/plans/components/ScheduleWeekRow', () => ({
  WEEK_ROW_GUTTER: 10,
  WEEK_ROW_HEIGHT: 60,
}))

import useScheduleCalendar from '@/features/plans/hooks/useScheduleCalendar'
import { calendarMonthKey } from '@/features/plans/lib/scheduleRows'

const ROW = 60
const SCREEN = 600
/** Where `jumpToToday` puts today's week: on the focus line, less half a week. */
const TODAY_TOP = 48 + ROW * 2.5 - ROW / 2

const renders: ReturnType<typeof useScheduleCalendar>[] = []
const Harness = () => {
  renders.push(useScheduleCalendar({}))
  return null
}
const calendar = () => renders[renders.length - 1]

let offset = 0
const list = {
  getLayout: (index: number) => ({
    x: 0,
    y: index * ROW,
    width: 390,
    height: ROW,
  }),
  getWindowSize: () => ({ width: 390, height: SCREEN }),
  getAbsoluteLastScrollOffset: () => offset,
  computeVisibleIndices: () => ({
    startIndex: Math.floor(offset / ROW),
    endIndex: Math.floor((offset + SCREEN) / ROW),
  }),
  scrollToOffset: vi.fn(),
  scrollToIndex: vi.fn(async () => {}),
}

let renderer: ReactTestRenderer | undefined
beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 10, 12))
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
    setTimeout(callback, 0)
  )
  renders.length = 0
  list.scrollToOffset.mockClear()
  list.scrollToIndex.mockClear()
  await act(async () => {
    renderer = create(<Harness />)
  })
  ;(calendar().listRef as { current: unknown }).current = list
  act(() => calendar().onListLayout({ x: 0, y: 0, width: 390, height: SCREEN }))
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const todayOffset = () =>
  calendar().schedule.dayRow.get('2026-10-10')! * ROW - TODAY_TOP

it('jumps to today from far off without the list’s scrollToIndex', () => {
  offset = todayOffset() + SCREEN * 10
  act(() => calendar().jumpToToday())

  expect(list.scrollToIndex).not.toHaveBeenCalled()
  // A third of a screen short, then a glide the rest of the way.
  expect(list.scrollToOffset.mock.calls).toEqual([
    [{ offset: todayOffset() + SCREEN / 3, animated: false }],
    [{ offset: todayOffset(), animated: true }],
  ])
})

it('glides straight to today when it’s within a screen', () => {
  offset = todayOffset() - SCREEN / 2
  act(() => calendar().jumpToToday())

  expect(list.scrollToOffset.mock.calls).toEqual([
    [{ offset: todayOffset(), animated: true }],
  ])
})

const headerOffset = (year: number, month: number) =>
  calendar().schedule.monthHeader.get(calendarMonthKey({ year, month }))! * ROW

it('jumps straight to a month whose weeks go in below the list', async () => {
  offset = todayOffset()
  await act(async () => calendar().showMonth({ year: 2029, month: 6 }))

  expect(list.scrollToIndex).not.toHaveBeenCalled()
  expect(list.scrollToOffset).toHaveBeenLastCalledWith({
    offset: headerOffset(2029, 6),
    animated: true,
  })
})

it('lets the list jump to a month whose weeks go in above it', async () => {
  offset = todayOffset()
  await act(async () => calendar().showMonth({ year: 2024, month: 9 }))

  // The list shifts to keep its rows in place; its own jump waits that out.
  expect(list.scrollToOffset).not.toHaveBeenCalled()
  expect(list.scrollToIndex).toHaveBeenCalledWith(
    expect.objectContaining({
      index: headerOffset(2024, 9) / ROW,
      animated: true,
    })
  )
})
