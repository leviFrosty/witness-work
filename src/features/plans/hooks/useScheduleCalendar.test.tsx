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
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: () => ({ remove: () => {} }),
}))
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

const TODAY_TOP = 48 + ROW * 2.5 - ROW / 2

const renders: ReturnType<typeof useScheduleCalendar>[] = []
let options: Parameters<typeof useScheduleCalendar>[0] = {}
const Harness = () => {
  renders.push(useScheduleCalendar(options))
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
  options = {}
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const todayOffset = () =>
  calendar().schedule.dayRow.get('2026-10-10')! * ROW - TODAY_TOP

const headerOffset = (year: number, month: number) =>
  calendar().schedule.monthHeader.get(calendarMonthKey({ year, month }))! * ROW

const todayMonthOffset = () => headerOffset(2026, 9) - 8

it('jumps to today from far off without the list’s scrollToIndex', () => {
  offset = todayMonthOffset() + SCREEN * 10
  act(() => calendar().jumpToToday())

  expect(list.scrollToIndex).not.toHaveBeenCalled()

  expect(list.scrollToOffset.mock.calls).toEqual([
    [{ offset: todayMonthOffset() + SCREEN / 3, animated: false }],
    [{ offset: todayMonthOffset(), animated: true }],
  ])
})

it('glides straight to today when it’s within a screen', () => {
  offset = todayMonthOffset() - SCREEN / 2
  act(() => calendar().jumpToToday())

  expect(list.scrollToOffset.mock.calls).toEqual([
    [{ offset: todayMonthOffset(), animated: true }],
  ])
})

it('puts today’s week on the focus line when its month’s name won’t fit above it', () => {
  act(() => calendar().onListLayout({ x: 0, y: 0, width: 390, height: 180 }))
  offset = todayOffset() + SCREEN
  act(() => calendar().jumpToToday())

  const focusTop = 180 / 3 - ROW / 2
  expect(list.scrollToOffset).toHaveBeenLastCalledWith({
    offset: calendar().schedule.dayRow.get('2026-10-10')! * ROW - focusTop,
    animated: true,
  })
})

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

  expect(list.scrollToOffset).not.toHaveBeenCalled()
  expect(list.scrollToIndex).toHaveBeenCalledWith(
    expect.objectContaining({
      index: headerOffset(2024, 9) / ROW,
      animated: true,
    })
  )
})

it('waits for the list to load before revealing a day above a sheet', () => {
  offset = todayOffset() + 400
  act(() => {
    calendar().revealDay(new Date(2026, 9, 10), 300)
  })
  expect(list.scrollToOffset).not.toHaveBeenCalled()

  act(() => {
    calendar().onListLoad()
    vi.advanceTimersByTime(150)
  })

  expect(list.scrollToOffset.mock.calls).toEqual([
    [{ offset: todayOffset(), animated: true }],
  ])
})

it('keeps its focus line in the part a day’s sheet leaves in view', () => {
  offset = todayOffset() + 400
  act(() => {
    calendar().onListLoad()
    vi.advanceTimersByTime(150)
  })
  act(() => {
    calendar().coverBottom(300)
    calendar().revealDay(new Date(2026, 9, 10), 300)
  })

  const row = calendar().schedule.dayRow.get('2026-10-10')!
  expect(list.scrollToOffset).toHaveBeenLastCalledWith({
    offset: row * ROW - (100 - ROW / 2),
    animated: true,
  })
})

it('opens on a linked day’s week, with nothing left to reveal once it loads', async () => {
  act(() => renderer?.unmount())
  renders.length = 0
  options = { initialDay: '2026-11-19' }
  await act(async () => {
    renderer = create(<Harness />)
  })
  ;(calendar().listRef as { current: unknown }).current = list
  act(() => calendar().onListLayout({ x: 0, y: 0, width: 390, height: SCREEN }))

  const row = calendar().schedule.dayRow.get('2026-11-19')!

  expect(calendar().initialRowIndex).toBe(row - 1)
  expect(calendar().focusedMonth).toEqual({ year: 2026, month: 10 })

  offset = (row - 6) * ROW
  act(() => {
    calendar().revealDay(new Date(2026, 10, 19), 300)
  })
  act(() => {
    calendar().onListLoad()
    vi.advanceTimersByTime(150)
  })
  expect(list.scrollToOffset).not.toHaveBeenCalled()
  expect(list.scrollToIndex).not.toHaveBeenCalled()
})

const revealUnderSheet = (from: number) => {
  offset = from
  act(() => {
    calendar().onListLoad()
    vi.advanceTimersByTime(150)
  })
  act(() => {
    calendar().coverBottom(300)
    calendar().revealDay(new Date(2026, 9, 10), 300)
  })

  offset = list.scrollToOffset.mock.lastCall![0].offset
  list.scrollToOffset.mockClear()
}

it('scrolls back to where it was when a day’s sheet closes', () => {
  const from = todayOffset() - 400 + 25
  revealUnderSheet(from)

  act(() => calendar().coverBottom(0))
  expect(list.scrollToOffset).toHaveBeenLastCalledWith({
    offset: from,
    animated: true,
  })
})

it('stays where the user scrolled while the sheet was open', () => {
  revealUnderSheet(todayOffset() - 400)

  act(() => calendar().onScrollBeginDrag())
  offset += 200
  act(() => calendar().coverBottom(0))
  expect(list.scrollToOffset).not.toHaveBeenCalled()
})

it('stays where a jump took the list while the sheet was open', () => {
  revealUnderSheet(todayOffset() - 400)

  act(() => calendar().jumpToToday())
  list.scrollToOffset.mockClear()
  act(() => calendar().coverBottom(0))
  expect(list.scrollToOffset).not.toHaveBeenCalled()
})

it('goes back past every day revealed while the sheet stayed open', () => {
  const from = todayOffset() - 400
  revealUnderSheet(from)

  act(() => {
    calendar().revealDay(new Date(2026, 9, 31), 300)
  })
  expect(list.scrollToOffset).toHaveBeenCalledTimes(1)
  offset = list.scrollToOffset.mock.lastCall![0].offset

  act(() => calendar().coverBottom(0))
  expect(list.scrollToOffset).toHaveBeenLastCalledWith({
    offset: from,
    animated: true,
  })
})
