import type { FlashListRef } from '@shopify/flash-list'
import moment from 'moment'
import { useEffect, useRef, useState } from 'react'
import type { LayoutRectangle } from 'react-native'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { serviceYearMonths, serviceYearOfMonth } from '@/lib/roleHistory'
import type { ScheduleView } from '@/features/plans/components/ScheduleViewToggle'
import { MONTH_GRID_PADDING } from '@/features/plans/components/ScheduleMonthView'
import type { ScheduleYearViewHandle } from '@/features/plans/components/ScheduleYearView'
import { MONTH_HEADER_HEIGHT } from '@/features/plans/components/ScheduleMonthHeader'
import {
  WEEK_ROW_GUTTER,
  WEEK_ROW_HEIGHT,
} from '@/features/plans/components/ScheduleWeekRow'
import useScheduleZoom from '@/features/plans/hooks/useScheduleZoom'
import {
  buildScheduleRows,
  calendarMonthKey,
  monthRows,
  sameCalendarMonth,
  type ScheduleRow,
} from '@/features/plans/lib/scheduleRows'
import type { Rect } from '@/features/plans/lib/scheduleZoom'

/** Where in the visible weeks the focused month is read: a third down. */
const FOCUS_LINE = 1 / 3
/**
 * …but never lower than halfway into a month's third week, which every month
 * fills: on a tall window a third down passes a month brought to the top, and
 * the next month would take the focus.
 */
const MAX_FOCUS_LINE = MONTH_HEADER_HEIGHT + WEEK_ROW_HEIGHT * 2.5
/** Programmatic scrolls don't tick haptics while they settle. */
const QUIET_AFTER_JUMP_MS = 700
const MIN_TICK_INTERVAL_MS = 120
/** The longest a view waits, hidden, for its content to catch up. */
const RELEASE_FALLBACK_MS = 500

export type YearOpenSource = 'toggle' | 'pinch' | 'divider'

/**
 * The week grid, rebuilt only when its range or the Start of Week changes. Its
 * own hook so the React Compiler caches it: built inline, it was rebuilt on
 * every render and every visible week re-rendered with it.
 */
function useScheduleRows(firstServiceYear: number, lastServiceYear: number) {
  const startOfWeek = useStartOfWeek()
  return buildScheduleRows({ firstServiceYear, lastServiceYear, startOfWeek })
}

/**
 * State and gestures behind the Schedule's calendar: the Month view's
 * continuous weeks (which month is in focus, jumps, today's whereabouts), the
 * Year view's Service Year, and the zoom between them. The screen and its stage
 * stay declarative; every timing-sensitive step lives here.
 *
 * Positions come from the list itself rather than from row arithmetic: rows
 * that haven't rendered yet only have estimated positions, so everything here
 * works from row indices and the layouts of rows on screen.
 */
export default function useScheduleCalendar({
  initial,
}: {
  /** The month to open on; this month when absent. */
  initial?: CalendarMonth
}) {
  // Plain values, so what's derived from today stays cached until it changes.
  const now = moment()
  const todayKey = now.format('YYYY-MM-DD')
  const thisYear = now.year()
  const thisMonthIndex = now.month()
  const start = initial ?? { year: thisYear, month: thisMonthIndex }
  const currentServiceYear = serviceYearOfMonth({
    year: thisYear,
    month: thisMonthIndex,
  })

  const [view, setViewState] = useState<ScheduleView>('month')
  // Handlers read the view from here rather than from state, so they stay the
  // same across a switch and the views behind them don't re-render mid-zoom.
  const viewRef = useRef<ScheduleView>('month')
  const setView = (next: ScheduleView) => {
    viewRef.current = next
    setViewState(next)
  }
  const [focusedMonth, setFocusedMonth] = useState<CalendarMonth>(start)
  const [yearServiceYear, setYearServiceYear] = useState(() =>
    serviceYearOfMonth(start)
  )
  // A Service Year either side of this one and of the month opened on.
  const [range, setRange] = useState(() => ({
    first: Math.min(currentServiceYear, serviceYearOfMonth(start)) - 1,
    last: Math.max(currentServiceYear, serviceYearOfMonth(start)) + 1,
  }))
  const [todayDirection, setTodayDirection] = useState<
    'visible' | 'up' | 'down'
  >('visible')

  const schedule = useScheduleRows(range.first, range.last)
  const todayRow = schedule.dayRow.get(todayKey)

  const listRef = useRef<FlashListRef<ScheduleRow>>(null)
  const yearRef = useRef<ScheduleYearViewHandle>(null)
  const focusedRef = useRef(start)
  const zoomFrame = useRef<LayoutRectangle | null>(null)
  const listFrame = useRef<LayoutRectangle | null>(null)
  const quietUntil = useRef(0)
  const lastTick = useRef(0)
  /** A jump waiting for the weeks it needs, and what to do once it lands. */
  const pendingJump = useRef<{
    month: CalendarMonth
    animated: boolean
    landed: () => void
  } | null>(null)
  /** Counts holds on the Month view, so a stale release can't end a newer one. */
  const monthHold = useRef(0)
  const [initialRowIndex] = useState(
    () => schedule.monthHeader.get(calendarMonthKey(start)) ?? 0
  )

  const zoom = useScheduleZoom('month')

  const focusLine = () =>
    Math.min((listFrame.current?.height ?? 0) * FOCUS_LINE, MAX_FOCUS_LINE)
  const scrollOffset = () => listRef.current?.getAbsoluteLastScrollOffset() ?? 0

  /** The on-screen row covering a content offset. */
  const rowAt = (y: number) => {
    const list = listRef.current
    if (!list) return undefined
    const { startIndex, endIndex } = list.computeVisibleIndices()
    for (let i = Math.max(0, startIndex); i <= endIndex; i++) {
      const layout = list.getLayout(i)
      if (layout && y >= layout.y && y < layout.y + layout.height) return i
    }
    return undefined
  }

  const focus = (month: CalendarMonth, tick: boolean) => {
    const previous = focusedRef.current
    if (sameCalendarMonth(previous, month)) return
    focusedRef.current = month
    setFocusedMonth(month)
    const now = Date.now()
    if (!tick || now < quietUntil.current) return
    if (now - lastTick.current < MIN_TICK_INTERVAL_MS) return
    lastTick.current = now
    // A Service Year border lands harder than a month border.
    if (serviceYearOfMonth(previous) !== serviceYearOfMonth(month))
      Haptics.light()
    else Haptics.selection()
  }

  const updateTodayDirection = () => {
    const list = listRef.current
    if (!list || todayRow === undefined) return
    const { startIndex, endIndex } = list.computeVisibleIndices()
    const next =
      todayRow < startIndex ? 'up' : todayRow > endIndex ? 'down' : 'visible'
    setTodayDirection((current) => (current === next ? current : next))
  }

  const onScroll = (y: number) => {
    const row = rowAt(y + focusLine())
    if (row !== undefined) focus(schedule.rows[row].month, true)
    updateTodayDirection()
  }

  /** Scrolls so the row's top sits `top` points below the list's. */
  const scrollToRow = (
    index: number,
    animated: boolean,
    top = 0
  ): Promise<void> => {
    quietUntil.current = Date.now() + QUIET_AFTER_JUMP_MS
    const done =
      listRef.current?.scrollToIndex({ index, animated, viewOffset: -top }) ??
      Promise.resolve()
    return done.then(updateTodayDirection)
  }

  const scrollToMonth = (month: CalendarMonth, animated: boolean) => {
    // The month's name lands at the top, its weeks under it.
    const rows = monthRows(schedule, month)
    return rows ? scrollToRow(rows.header, animated) : Promise.resolve()
  }

  /** The range with `serviceYear` and a Service Year either side of it. */
  const rangeAround = (
    current: { first: number; last: number },
    serviceYear: number
  ) => ({
    first: Math.min(current.first, serviceYear - 1),
    last: Math.max(current.last, serviceYear + 1),
  })

  const includeServiceYear = (serviceYear: number) =>
    setRange((current) => {
      const next = rangeAround(current, serviceYear)
      return next.first === current.first && next.last === current.last
        ? current
        : next
    })

  /**
   * Scrolls to a month, adding weeks first when it's near either end of the
   * list. Their rows go in before the scroll starts: rows added while the list
   * is still moving shift every index under it, and the jump lands a year off.
   * The year to spare on each side keeps the list from adding rows of its own
   * as it arrives.
   */
  const jumpToMonth = (
    month: CalendarMonth,
    animated: boolean
  ): Promise<void> => {
    const next = rangeAround(range, serviceYearOfMonth(month))
    if (next.first === range.first && next.last === range.last)
      return scrollToMonth(month, animated)
    // Always a new range, so a render follows to run the jump.
    setRange((current) => rangeAround(current, serviceYearOfMonth(month)))
    return new Promise((landed) => {
      pendingJump.current = { month, animated, landed }
    })
  }

  // The Year view has drawn its new Service Year.
  useEffect(() => {
    requestAnimationFrame(() => zoom.release('year'))
  }, [yearServiceYear, zoom])

  useEffect(() => {
    const jump = pendingJump.current
    if (!jump || !monthRows(schedule, jump.month)) return
    pendingJump.current = null
    scrollToMonth(jump.month, jump.animated).then(jump.landed)
  })

  const jumpToToday = () => {
    Haptics.light()
    if (todayRow === undefined) return
    // Today's week lands on the focus line, so its month stays in focus.
    scrollToRow(todayRow, true, Math.max(0, focusLine() - WEEK_ROW_HEIGHT / 2))
    focus({ year: thisYear, month: thisMonthIndex }, false)
  }

  /** The month's weeks in the stage's coordinates, as scrolled now. */
  const monthRectInStage = (month: CalendarMonth): Rect | undefined => {
    const rows = monthRows(schedule, month)
    const frame = zoomFrame.current
    const list = listFrame.current
    const first = rows && listRef.current?.getLayout(rows.first)
    if (!rows || !frame || !list || !first) return undefined
    return {
      x: frame.x + MONTH_GRID_PADDING,
      y: frame.y + list.y + first.y - scrollOffset() + WEEK_ROW_GUTTER,
      width: frame.width - MONTH_GRID_PADDING * 2,
      // Week rows share one height, so rows not yet on screen still count.
      height: (rows.last - rows.first + 1) * WEEK_ROW_HEIGHT - WEEK_ROW_GUTTER,
    }
  }

  const zoomOut = (source: YearOpenSource, serviceYear?: number) => {
    if (viewRef.current === 'year') return
    const target =
      serviceYear === undefined ||
      serviceYear === serviceYearOfMonth(focusedRef.current)
        ? focusedRef.current
        : { year: serviceYear, month: 8 }
    if (source !== 'toggle') Haptics.light()
    // Every Service Year lays out the same grid, so the tile is measured even
    // when the year changes with this render; the zoom starts before it.
    yearRef.current?.reveal(target)
    const tile = yearRef.current?.monthRect(target)
    const month = monthRectInStage(target)
    if (serviceYearOfMonth(target) !== yearServiceYear) zoom.hold('year')
    zoom.zoomTo('year', tile && month ? { month, tile } : null)
    setYearServiceYear(serviceYearOfMonth(target))
    setView('year')
    analytics.capture('schedule_year_view_opened', { source })
  }

  /**
   * Where a month's weeks will sit once the list lands on it: under its name at
   * the top. Known before the list moves, so the zoom can start on the tap.
   */
  const landingRect = (month: CalendarMonth): Rect | undefined => {
    const rows = monthRows(schedule, month)
    const frame = zoomFrame.current
    const list = listFrame.current
    if (!rows || !frame || !list) return undefined
    return {
      x: frame.x + MONTH_GRID_PADDING,
      y: frame.y + list.y + MONTH_HEADER_HEIGHT + WEEK_ROW_GUTTER,
      width: frame.width - MONTH_GRID_PADDING * 2,
      height: (rows.last - rows.first + 1) * WEEK_ROW_HEIGHT - WEEK_ROW_GUTTER,
    }
  }

  const zoomIn = (target: CalendarMonth) => {
    if (
      viewRef.current === 'month' &&
      sameCalendarMonth(target, focusedRef.current)
    )
      return
    // The zoom starts first, on the UI thread, so it doesn't wait for the
    // render that swaps the views.
    const tile = yearRef.current?.monthRect(target)
    const moves = !sameCalendarMonth(target, focusedRef.current)
    // A month the list already shows stays where it is; only a new one lands
    // at the top.
    const month = moves
      ? landingRect(target)
      : (monthRectInStage(target) ?? landingRect(target))
    if (moves) zoom.hold('month')
    zoom.zoomTo('month', tile && month ? { month, tile } : null)
    focus(target, false)
    setView('month')
    if (!moves) return
    // Shown once the list has landed and drawn the month, or soon regardless.
    const hold = ++monthHold.current
    const release = () => {
      if (monthHold.current === hold) zoom.release('month')
    }
    setTimeout(release, RELEASE_FALLBACK_MS)
    jumpToMonth(target, false).then(() => requestAnimationFrame(release))
  }

  /** The Year view's month for a toggle back to Month. */
  const monthForYearView = (): CalendarMonth => {
    if (serviceYearOfMonth(focusedRef.current) === yearServiceYear)
      return focusedRef.current
    if (yearServiceYear === currentServiceYear)
      return { year: thisYear, month: thisMonthIndex }
    return { year: yearServiceYear, month: 8 }
  }

  const changeView = (next: ScheduleView, source: YearOpenSource) => {
    if (next === viewRef.current) return
    if (next === 'year') zoomOut(source)
    else zoomIn(monthForYearView())
  }

  /** The tile nearest a point in the stage, for pinching into a month. */
  const monthNear = (x: number, y: number): CalendarMonth => {
    let best = monthForYearView()
    let bestDistance = Infinity
    for (const month of serviceYearMonths(yearServiceYear)) {
      const rect = yearRef.current?.monthRect(month)
      if (!rect) continue
      const dx = rect.x + rect.width / 2 - x
      const dy = rect.y + rect.height / 2 - y
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        best = month
      }
    }
    return best
  }

  const changeServiceYear = (serviceYear: number) => {
    includeServiceYear(serviceYear)
    setYearServiceYear(serviceYear)
  }

  return {
    view,
    focusedMonth,
    yearServiceYear,
    schedule,
    initialRowIndex,
    listRef,
    yearRef,
    zoom,
    todayDirection,
    currentServiceYear,
    isCurrentServiceYear: yearServiceYear === currentServiceYear,
    onScroll,
    onZoomFrameLayout: (frame: LayoutRectangle) => {
      zoomFrame.current = frame
      zoom.setMonthFrame(frame)
    },
    onListLayout: (frame: LayoutRectangle) => {
      listFrame.current = frame
      updateTodayDirection()
    },
    onStageLayout: (frame: LayoutRectangle) => {
      zoom.setYearFrame({
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
      })
    },
    onStartReached: () =>
      setRange((current) => ({ ...current, first: current.first - 1 })),
    onEndReached: () =>
      setRange((current) => ({ ...current, last: current.last + 1 })),
    changeView,
    zoomOut,
    zoomIn,
    monthNear,
    jumpToToday,
    showMonth: (month: CalendarMonth) => {
      if (viewRef.current === 'year') zoomIn(month)
      else jumpToMonth(month, true)
    },
    changeServiceYear,
    showCurrentServiceYear: () => {
      Haptics.light()
      changeServiceYear(currentServiceYear)
    },
  }
}
