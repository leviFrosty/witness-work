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

const FOCUS_LINE = 1 / 3

const MAX_FOCUS_LINE = MONTH_HEADER_HEIGHT + WEEK_ROW_HEIGHT * 2.5

const REVEAL_MARGIN = 12

const TODAY_HEADER_GAP = 8

const QUIET_AFTER_JUMP_MS = 700
const MIN_TICK_INTERVAL_MS = 120

const RELEASE_FALLBACK_MS = 500

const LANDING_MS = { animated: 300, instant: 200 }

const INITIAL_SCROLL_MS = 150

export type YearOpenSource = 'toggle' | 'pinch' | 'divider'

function useScheduleRows(firstServiceYear: number, lastServiceYear: number) {
  const startOfWeek = useStartOfWeek()
  return buildScheduleRows({ firstServiceYear, lastServiceYear, startOfWeek })
}

export default function useScheduleCalendar({
  initial,
  initialDay,
}: {
  initial?: CalendarMonth

  initialDay?: string
}) {
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

  const viewRef = useRef<ScheduleView>('month')
  const setView = (next: ScheduleView) => {
    viewRef.current = next
    setViewState(next)
  }
  const [focusedMonth, setFocusedMonth] = useState<CalendarMonth>(start)

  const focusedOrdinal = useSharedValue(monthOrdinal(start))

  const [yearFocusedMonth, setYearFocusedMonth] = useState<CalendarMonth>(start)
  const [yearServiceYear, setYearServiceYear] = useState(() =>
    serviceYearOf(start)
  )

  const [range, setRange] = useState(() => ({
    first: Math.min(currentServiceYear, serviceYearOf(start)) - 1,
    last: Math.max(currentServiceYear, serviceYearOf(start)) + 1,
  }))
  const [todayDirection, setTodayDirection] = useState<
    'visible' | 'up' | 'down'
  >('visible')

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

  const pendingJump = useRef<{
    month: CalendarMonth
    animated: boolean

    addedAbove: boolean
    landed: () => void
  } | null>(null)

  const pendingReveal = useRef<{ date: Date; covered: number } | null>(null)
  const listLoaded = useRef(false)

  const sheetCover = useRef(0)

  const returnTo = useRef<{ key: string; below: number } | null>(null)

  const pinchStart = useRef({ x: 0, y: 0 })

  const monthHold = useRef(0)
  const [openedDayRow] = useState(() =>
    openedDay ? schedule.dayRow.get(openedDay.format('YYYY-MM-DD')) : undefined
  )

  const [initialRowIndex] = useState(() =>
    openedDayRow !== undefined
      ? Math.max(0, openedDayRow - 1)
      : (schedule.monthHeader.get(calendarMonthKey(start)) ?? 0)
  )

  const zoom = useScheduleZoom('month')

  const focusLine = () =>
    Math.min(
      ((listFrame.current?.height ?? 0) - sheetCover.current) * FOCUS_LINE,
      MAX_FOCUS_LINE
    )
  const scrollOffset = () => listRef.current?.getAbsoluteLastScrollOffset() ?? 0

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

  const scrollToRow = (
    index: number,
    animated: boolean,
    top = 0,

    addedAbove = false
  ): Promise<void> => {
    returnTo.current = null
    quietUntil.current = Date.now() + QUIET_AFTER_JUMP_MS
    const list = listRef.current
    const layout = list?.getLayout(index)
    if (!list || !layout) return Promise.resolve()

    if (addedAbove)
      return list
        .scrollToIndex({ index, animated, viewOffset: -top })
        .then(updateTodayDirection)
    const offset = Math.max(0, layout.y - top)

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
    const rows = monthRows(schedule, month)
    return rows
      ? scrollToRow(rows.header, animated, 0, addedAbove)
      : Promise.resolve()
  }

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

  const jumpToMonth = (
    month: CalendarMonth,
    animated: boolean
  ): Promise<void> => {
    const next = rangeAround(range, serviceYearOf(month))
    if (next.first === range.first && next.last === range.last)
      return scrollToMonth(month, animated)

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
    else
      scrollToRow(
        todayRow,
        true,
        Math.max(0, focusLine() - WEEK_ROW_HEIGHT / 2)
      )
    focus({ year: thisYear, month: thisMonthIndex }, false)
  }

  const placeNow = () => {
    const offset = scrollOffset()
    const index = rowAt(offset)
    const layout =
      index === undefined ? undefined : listRef.current?.getLayout(index)
    if (index === undefined || !layout) return null
    return { key: schedule.rows[index].key, below: offset - layout.y }
  }

  const scrollBack = () => {
    const place = returnTo.current
    returnTo.current = null
    if (!place) return
    const index = schedule.rows.findIndex((row) => row.key === place.key)
    if (index >= 0) scrollToRow(index, true, -place.below)
  }

  const revealDay = (date: Date, covered: number) => {
    const row = schedule.dayRow.get(moment(date).format('YYYY-MM-DD'))
    if (row === undefined) return false
    const layout = listRef.current?.getLayout(row)
    const frame = listFrame.current
    if (!listLoaded.current && row === openedDayRow) {
      pendingReveal.current = null
      return true
    }
    if (!listLoaded.current || !layout || !frame) {
      pendingReveal.current = { date, covered }
      return true
    }
    pendingReveal.current = null

    const visible = frame.height - covered - REVEAL_MARGIN
    const top = layout.y - scrollOffset()
    if (top >= 0 && top + layout.height <= visible) return true
    const target = Math.min(
      focusLine() - WEEK_ROW_HEIGHT / 2,
      visible - layout.height
    )

    const back = returnTo.current ?? placeNow()
    scrollToRow(row, true, Math.max(0, target))
    returnTo.current = back
    return true
  }

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

      height: (rows.last - rows.first + 1) * WEEK_ROW_HEIGHT - WEEK_ROW_GUTTER,
    }
  }

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
    returnTo.current = null
    const target =
      serviceYear === undefined ||
      serviceYear === serviceYearOf(focusedRef.current)
        ? focusedRef.current
        : { year: serviceYear, month: 8 }
    if (source !== 'toggle') Haptics.light()

    yearRef.current?.reveal(target)
    const tile = yearRef.current?.monthRect(target)

    const month = monthLanding ? landingRect(target) : monthRectInStage(target)
    if (serviceYearOf(target) !== yearServiceYear) zoom.hold('year')
    zoom.zoomTo('year', tile && month ? { month, tile } : null)
    setYearFocusedMonth(focusedRef.current)
    setYearServiceYear(serviceYearOf(target))
    setView('year')
    analytics.capture('schedule_year_view_opened', { source })
  }

  const land = (target: CalendarMonth, hold: number) => {
    if (monthHold.current !== hold) return

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

    const tile = yearRef.current?.monthRect(target)
    const moves = !sameCalendarMonth(target, focusedRef.current)

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

    onScrollBeginDrag: () => {
      returnTo.current = null
    },
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

    pinchStarted: (x: number, y: number) => {
      pinchStart.current = { x, y }
    },
    pinchedMonth: () => monthNear(pinchStart.current.x, pinchStart.current.y),
    jumpToToday,
    revealDay,

    coverBottom: (height: number) => {
      sheetCover.current = height
      if (!height) scrollBack()
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
