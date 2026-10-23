import type { FlashListRef } from '@shopify/flash-list'
import moment from 'moment'
import { useEffect, useRef, useState } from 'react'
import type { LayoutRectangle } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import useLocalDay from '@/hooks/useLocalDay'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { serviceYearMonths } from '@/lib/roleHistory'
import { serviceYearOf } from '@/lib/serviceYear'
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
  monthOrdinal,
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
/** Room left between a revealed week and the sheet covering the list. */
const REVEAL_MARGIN = 12
/**
 * Room above the month's name when Today brings it to the top. Within the space
 * under the last week's squares, so none of them peeks in.
 */
const TODAY_HEADER_GAP = 8
/** Programmatic scrolls don't tick haptics while they settle. */
const QUIET_AFTER_JUMP_MS = 700
const MIN_TICK_INTERVAL_MS = 120
/** The longest a view waits, hidden, for its content to catch up. */
const RELEASE_FALLBACK_MS = 500
/** How long a jump gets to land and draw, as the list's own jumps wait. */
const LANDING_MS = { animated: 300, instant: 200 }
/**
 * After the list loads, it keeps its first row in place for about 100ms,
 * undoing scrolls in the meantime.
 */
const INITIAL_SCROLL_MS = 150

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
  initialDay,
}: {
  /** The month to open on; this month when absent. */
  initial?: CalendarMonth
  /**
   * A day (`YYYY-MM-DD`) to open on, e.g. one a link opens as the tab first
   * mounts. Its week starts near the top, clear of the day's sheet.
   */
  initialDay?: string
}) {
  // Plain values, so what's derived from today stays cached until it changes.
  const todayKey = useLocalDay()
  const now = moment(todayKey, 'YYYY-MM-DD')
  const thisYear = now.year()
  const thisMonthIndex = now.month()
  const [openedDay] = useState(() => {
    const day = initialDay ? moment(initialDay, 'YYYY-MM-DD', true) : null
    return day?.isValid() ? day : null
  })
  const openedMonth = openedDay
    ? { year: openedDay.year(), month: openedDay.month() }
    : undefined
  const start = initial ??
    openedMonth ?? { year: thisYear, month: thisMonthIndex }
  const currentServiceYear = serviceYearOf({
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
  // The weeks dim around the focused month on the UI thread, so a scroll into
  // the next month re-renders only what names the month, not every week.
  const focusedOrdinal = useSharedValue(monthOrdinal(start))
  // The month the Year view rings. It catches up on each zoom rather than
  // following every month scrolled past while the view is hidden.
  const [yearFocusedMonth, setYearFocusedMonth] = useState<CalendarMonth>(start)
  const [yearServiceYear, setYearServiceYear] = useState(() =>
    serviceYearOf(start)
  )
  // A Service Year either side of this one and of the month opened on.
  const [range, setRange] = useState(() => ({
    first: Math.min(currentServiceYear, serviceYearOf(start)) - 1,
    last: Math.max(currentServiceYear, serviceYearOf(start)) + 1,
  }))
  const [todayDirection, setTodayDirection] = useState<
    'visible' | 'up' | 'down'
  >('visible')
  // A month zoomed into that the hidden list hasn't landed on yet. Until it
  // shows, the list still holds the month before, so it takes no touches.
  const [monthLanding, setMonthLanding] = useState(false)

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
    /** Its weeks go in above the list's position. */
    addedAbove: boolean
    landed: () => void
  } | null>(null)
  /**
   * A day to reveal once the list has loaded, e.g. one a link opens as the tab
   * first mounts.
   */
  const pendingReveal = useRef<{ date: Date; covered: number } | null>(null)
  const listLoaded = useRef(false)
  /** How much of the list's bottom a day's sheet covers. */
  const sheetCover = useRef(0)
  /** Where the fingers came down on the Year view's last pinch. */
  const pinchStart = useRef({ x: 0, y: 0 })
  /** Counts holds on the Month view, so a stale release can't end a newer one. */
  const monthHold = useRef(0)
  const [openedDayRow] = useState(() =>
    openedDay ? schedule.dayRow.get(openedDay.format('YYYY-MM-DD')) : undefined
  )
  // A day opened on starts a row down, so the week before it shows too.
  const [initialRowIndex] = useState(() =>
    openedDayRow !== undefined
      ? Math.max(0, openedDayRow - 1)
      : (schedule.monthHeader.get(calendarMonthKey(start)) ?? 0)
  )

  const zoom = useScheduleZoom('month')

  // In the part of the list a day's sheet leaves in view.
  const focusLine = () =>
    Math.min(
      ((listFrame.current?.height ?? 0) - sheetCover.current) * FOCUS_LINE,
      MAX_FOCUS_LINE
    )
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
    focusedOrdinal.set(monthOrdinal(month))
    setFocusedMonth(month)
    const now = Date.now()
    if (!tick || now < quietUntil.current) return
    if (now - lastTick.current < MIN_TICK_INTERVAL_MS) return
    lastTick.current = now
    // A Service Year border lands harder than a month border.
    if (serviceYearOf(previous) !== serviceYearOf(month)) Haptics.light()
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

  /**
   * Scrolls so the row's top sits `top` points below the list's.
   *
   * Straight to the row's offset: the list's `scrollToIndex` first renders five
   * stops on the way to learn where unmeasured rows land, and with a native
   * menu on every day those renders held the list still for a second before it
   * moved. Each kind of row has one fixed height, so once the list has measured
   * one of a kind, the offsets it gives rows it hasn't rendered are exact.
   */
  const scrollToRow = (
    index: number,
    animated: boolean,
    top = 0,
    /** Rows went in above the list's position in the last render. */
    addedAbove = false
  ): Promise<void> => {
    quietUntil.current = Date.now() + QUIET_AFTER_JUMP_MS
    const list = listRef.current
    const layout = list?.getLayout(index)
    if (!list || !layout) return Promise.resolve()
    // The list then shifts its offset by their height to keep what's on screen
    // in place, and on Android that shift lands after a direct jump and pushes
    // it as far past the row. Its own jump holds the shift until it lands.
    if (addedAbove)
      return list
        .scrollToIndex({ index, animated, viewOffset: -top })
        .then(updateTodayDirection)
    const offset = Math.max(0, layout.y - top)
    // Every row scrolled past renders on the way, so from more than a screen
    // off the list lands a third of a screen short at once and glides the rest.
    const screen = list.getWindowSize().height
    const distance = offset - scrollOffset()
    if (animated && Math.abs(distance) > screen)
      list.scrollToOffset({
        offset: offset - (Math.sign(distance) * screen) / 3,
        animated: false,
      })
    list.scrollToOffset({ offset, animated })
    return new Promise<void>((landed) =>
      setTimeout(landed, animated ? LANDING_MS.animated : LANDING_MS.instant)
    ).then(updateTodayDirection)
  }

  const scrollToMonth = (
    month: CalendarMonth,
    animated: boolean,
    addedAbove = false
  ) => {
    // The month's name lands at the top, its weeks under it.
    const rows = monthRows(schedule, month)
    return rows
      ? scrollToRow(rows.header, animated, 0, addedAbove)
      : Promise.resolve()
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
    const next = rangeAround(range, serviceYearOf(month))
    if (next.first === range.first && next.last === range.last)
      return scrollToMonth(month, animated)
    // Always a new range, so a render follows to run the jump.
    setRange((current) => rangeAround(current, serviceYearOf(month)))
    return new Promise((landed) => {
      pendingJump.current = {
        month,
        animated,
        addedAbove: next.first < range.first,
        landed,
      }
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
    scrollToMonth(jump.month, jump.animated, jump.addedAbove).then(jump.landed)
  })

  const jumpToToday = () => {
    Haptics.light()
    if (todayRow === undefined) return
    // The month's name lands at the top, clear of the weekday bar, with today
    // in the weeks under it.
    const header = schedule.monthHeader.get(
      calendarMonthKey({ year: thisYear, month: thisMonthIndex })
    )
    const headerLayout =
      header === undefined ? undefined : listRef.current?.getLayout(header)
    const todayLayout = listRef.current?.getLayout(todayRow)
    const visible =
      (listFrame.current?.height ?? 0) - sheetCover.current - REVEAL_MARGIN
    if (
      header !== undefined &&
      headerLayout &&
      todayLayout &&
      todayLayout.y + todayLayout.height - headerLayout.y + TODAY_HEADER_GAP <=
        visible
    )
      scrollToRow(header, true, TODAY_HEADER_GAP)
    // A window too short for both: today's week lands on the focus line, so
    // its month stays in focus.
    else
      scrollToRow(
        todayRow,
        true,
        Math.max(0, focusLine() - WEEK_ROW_HEIGHT / 2)
      )
    focus({ year: thisYear, month: thisMonthIndex }, false)
  }

  /**
   * Scrolls a day's week out from under a sheet covering the bottom `covered`
   * points of the list, onto the focus line when there's room, so its month
   * stays in focus. A week already in view stays put. Before the list has
   * loaded, it waits for it. False when the day isn't in the list, e.g. a
   * Service Year away.
   */
  const revealDay = (date: Date, covered: number) => {
    const row = schedule.dayRow.get(moment(date).format('YYYY-MM-DD'))
    if (row === undefined) return false
    const layout = listRef.current?.getLayout(row)
    const frame = listFrame.current
    if (!listLoaded.current && row === openedDayRow) {
      // The list opens on it, clear of the sheet. Scrolling there once the
      // list loaded instead landed on the month above on a busy cold start,
      // leaving the day under the sheet.
      pendingReveal.current = null
      return true
    }
    if (!listLoaded.current || !layout || !frame) {
      pendingReveal.current = { date, covered }
      return true
    }
    pendingReveal.current = null
    // Clear of the sheet's rounded top edge and its shadow.
    const visible = frame.height - covered - REVEAL_MARGIN
    const top = layout.y - scrollOffset()
    if (top >= 0 && top + layout.height <= visible) return true
    const target = Math.min(
      focusLine() - WEEK_ROW_HEIGHT / 2,
      visible - layout.height
    )
    scrollToRow(row, true, Math.max(0, target))
    return true
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

  const zoomOut = (source: YearOpenSource, serviceYear?: number) => {
    if (viewRef.current === 'year') return
    const target =
      serviceYear === undefined ||
      serviceYear === serviceYearOf(focusedRef.current)
        ? focusedRef.current
        : { year: serviceYear, month: 8 }
    if (source !== 'toggle') Haptics.light()
    // Every Service Year lays out the same grid, so the tile is measured even
    // when the year changes with this render; the zoom starts before it.
    yearRef.current?.reveal(target)
    const tile = yearRef.current?.monthRect(target)
    // Cut short before the list lands, the zoom goes back the way it came.
    const month = monthLanding ? landingRect(target) : monthRectInStage(target)
    if (serviceYearOf(target) !== yearServiceYear) zoom.hold('year')
    zoom.zoomTo('year', tile && month ? { month, tile } : null)
    setYearFocusedMonth(focusedRef.current)
    setYearServiceYear(serviceYearOf(target))
    setView('year')
    analytics.capture('schedule_year_view_opened', { source })
  }

  /**
   * Moves the hidden list onto a month zoomed into, then shows it. Called once
   * the zoom has settled: a jump re-renders every week on screen, and their
   * native menus take long enough to mount that the zoom stuttered whenever the
   * jump landed mid-flight. Over a still frame, the wait doesn't show.
   */
  const land = (target: CalendarMonth, hold: number) => {
    // A newer zoom in lands its own month.
    if (monthHold.current !== hold) return
    // Shown once the list has landed and drawn the month, or soon regardless.
    const release = () => {
      if (monthHold.current !== hold) return
      zoom.release('month')
      setMonthLanding(false)
    }
    setTimeout(release, RELEASE_FALLBACK_MS)
    jumpToMonth(target, false).then(() => requestAnimationFrame(release))
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
    if (moves) {
      zoom.hold('month')
      setMonthLanding(true)
    }
    const hold = moves ? ++monthHold.current : 0
    zoom.zoomTo(
      'month',
      tile && month ? { month, tile } : null,
      moves ? () => land(target, hold) : undefined
    )
    focus(target, false)
    setYearFocusedMonth(target)
    setView('month')
  }

  /** The Year view's month for a toggle back to Month. */
  const monthForYearView = (): CalendarMonth => {
    if (serviceYearOf(focusedRef.current) === yearServiceYear)
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
    monthLanding,
    focusedMonth,
    focusedOrdinal,
    yearFocusedMonth,
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
    onListLoad: () =>
      setTimeout(() => {
        listLoaded.current = true
        const pending = pendingReveal.current
        if (pending) revealDay(pending.date, pending.covered)
      }, INITIAL_SCROLL_MS),
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
    // A pinch zooms into the month where the fingers came down. By the end
    // they've spread apart, and once one lifts the focal point is the other
    // finger, often a row or two from the month aimed at.
    pinchStarted: (x: number, y: number) => {
      pinchStart.current = { x, y }
    },
    pinchedMonth: () => monthNear(pinchStart.current.x, pinchStart.current.y),
    jumpToToday,
    revealDay,
    /** A day's sheet now covers the bottom `height` points of the list. */
    coverBottom: (height: number) => {
      sheetCover.current = height
      const row = rowAt(scrollOffset() + focusLine())
      if (row !== undefined) focus(schedule.rows[row].month, false)
    },
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
