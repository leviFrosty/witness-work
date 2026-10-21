import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { ReactElement, ReactNode, Ref, useMemo, useState } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import moment from 'moment'
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { localDayKey, storedDayKey } from '@/lib/normalizeDate'

import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import {
  getPlansIntersectingDay,
  plannedMinutesForDay,
  type RecurringPlan,
} from '@/lib/recurrence'
import { getCategoryLabel, isLdcEntry } from '@/lib/serviceReportCategory'
import { formatMinutes, formatMinutesSpoken } from '@/lib/minutes'
import { entryMinutes } from '@/lib/entryMinutes'
import { usePreferences } from '@/stores/preferences'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
import type { RevealAboveSheet } from '@/hooks/useRevealAboveSheet'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'

import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import type {
  PlanDetailsSlot,
  PlanFormSlot,
} from '@/features/service-reports/components/DayHistoryView'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import Badge from '@/components/ui/Badge'
import Card, { useCardStyle } from '@/components/ui/Card'
import Circle from '@/components/ui/Circle'
import { getDateStatusColor } from '@/components/CalendarDay'
import ContextMenu from '@/components/ui/ContextMenu'
import DayPreview, { dayHasPreview } from '@/components/DayPreview'
import useDayMenuActions from '@/hooks/useDayMenuActions'
import { formatDisplay, formatMonthDayCompact } from '@/lib/dates'
import { alignText } from '@/lib/direction'
import { tracking } from '@/lib/tracking'

interface AllDaysListProps {
  month: number
  year: number
  /** Keeps the day picked in view above its sheet. */
  dayReveal?: RevealAboveSheet
  /** Each day's row, by its date (`YYYY-MM-DD`), e.g. to keep it in view. */
  dayRef?: (day: string) => Ref<View>
  /** The Plan form, for planning a day in its sheet. */
  renderPlanForm?: (slot: PlanFormSlot) => ReactNode
  /** Plan Details, for showing a day's Plan in its sheet. */
  renderPlanDetails?: {
    actions: (slot: PlanDetailsSlot) => ReactNode
    body: (slot: PlanDetailsSlot) => ReactNode
  }
  /**
   * `compact` keeps the list to a few days in one card that scrolls on its own,
   * for a Progress layout that wants the room for other cards.
   */
  variant?: 'full' | 'compact'
  /** Space on each side of the full list's rows. */
  inset?: number
  /** Wraps the column headings, e.g. to long-press them. */
  wrapHeader?: (header: ReactElement) => ReactElement
}

/** About four and a half compact rows, so the cut-off one says it scrolls. */
const COMPACT_LIST_HEIGHT = 200

type DayRow = {
  date: Date
  dayOfWeekLabel: string
  monthDayLabel: string
  isToday: boolean
  hoursLabel: string
  categoryLabel: string
  /** The row in words: the day, then its category and time or "No time". */
  accessibilityLabel: string
  isEmpty: boolean
  planDotColor: string | null
  reports: TimeEntry[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}

/**
 * One day in the list: tap opens the day's sheet; long-press offers Add Time /
 * Plan This Day with a preview of the day's entries and plans.
 */
const DayRowItem = ({
  row,
  onPress,
  inset,
  plain,
}: {
  row: DayRow
  onPress: () => void
  inset: number
  /** A divided row inside the compact card rather than a card of its own. */
  plain?: boolean
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const menu = useDayMenuActions(row.date)
  const stacked = useAccessibilityTextSize()
  const previewData = {
    reports: row.reports,
    dayPlans: row.dayPlans,
    recurringPlans: row.recurringPlans,
  }

  const day = (
    <View
      style={{
        flex: stacked ? undefined : 1,
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: stacked ? 'wrap' : undefined,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: stacked ? 'wrap' : undefined,
          gap: 6,
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: row.isEmpty ? theme.colors.textAlt : theme.colors.text,
          }}
          numberOfLines={1}
        >
          {row.dayOfWeekLabel}
        </Text>
        {row.planDotColor ? (
          <Circle color={row.planDotColor} size={6} />
        ) : (
          <Circle
            color='transparent'
            size={6}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.textAlt,
            }}
          />
        )}
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: row.isEmpty ? theme.colors.textAlt : theme.colors.text,
          }}
          numberOfLines={1}
        >
          {row.monthDayLabel}
        </Text>
      </View>
      {row.isToday ? <Badge size='xs'>{i18n.t('today')}</Badge> : null}
    </View>
  )
  const category = (
    <Text
      style={{
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
      }}
      numberOfLines={stacked ? undefined : 1}
    >
      {row.categoryLabel}
    </Text>
  )
  const hours = (
    <Text
      style={{
        fontFamily: theme.fonts.semiBold,
        color: row.isEmpty ? theme.colors.textAlt : theme.colors.text,
        minWidth: 44,
        textAlign: alignText('end'),
      }}
    >
      {row.hoursLabel}
    </Text>
  )

  return (
    <ContextMenu
      actions={menu}
      onPress={onPress}
      accessibilityLabel={row.accessibilityLabel}
      hoverRadius={plain ? 0 : cardStyle.borderRadius}
      preview={
        dayHasPreview(previewData) ? (
          <DayPreview date={row.date} {...previewData} />
        ) : undefined
      }
      style={{ marginHorizontal: plain ? 0 : inset }}
    >
      <View
        style={{
          ...(plain
            ? {
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              }
            : cardStyle),
          paddingVertical: plain ? 10 : 12,
          paddingHorizontal: 15,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {stacked ? (
          // At accessibility sizes the day can't share a line with its
          // category and hours: the day takes its own line, the rest sits
          // under it.
          <View style={{ flex: 1, gap: 4 }}>
            {day}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: 10,
              }}
            >
              {/* Side by side when they fit; otherwise the hours wrap under
                  the category, still at the end. */}
              <View style={{ flexGrow: 1, flexShrink: 1 }}>{category}</View>
              <View style={{ flexGrow: 1 }}>{hours}</View>
            </View>
          </View>
        ) : (
          <>
            {day}
            {category}
            {hours}
          </>
        )}
        <LucideIcon
          icon={ChevronForwardIcon}
          size={12}
          color={theme.colors.textAlt}
        />
      </View>
    </ContextMenu>
  )
}

/**
 * Flat "ALL DAYS" list for the Month tab. One row per calendar day of the
 * selected month, most-recent first. In the current month, future days are
 * omitted. Tapping a row opens `SelectedDateSheet` for that date.
 *
 * Aggregation per day:
 *
 * - Multiple reports with the same tag/type → show that category label.
 * - Multiple categories → show `i18n.t('multiple')`.
 * - Zero reports → em-dash for both category and hours.
 */
const AllDaysList = ({
  month,
  year,
  dayReveal,
  dayRef,
  renderPlanForm,
  renderPlanDetails,
  variant = 'full',
  inset = 15,
  wrapHeader = (header) => header,
}: AllDaysListProps) => {
  const theme = useTheme()
  const { fontScale } = useWindowDimensions()
  const stacked = useAccessibilityTextSize()
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()
  const { categories } = useCategories()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)

  const [sheet, setSheet] = useState<SelectedDateSheetState>({
    open: false,
    date: new Date(),
  })

  const [showAllDays, setShowAllDays] = useState(false)

  const { isCurrentMonth, daysInMonth } = useMemo(() => {
    const now = moment()
    const base = moment().month(month).year(year).startOf('month')
    return {
      isCurrentMonth: now.month() === month && now.year() === year,
      daysInMonth: base.daysInMonth(),
    }
  }, [month, year])

  const hasFutureDays = isCurrentMonth && moment().date() < daysInMonth

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const rows = useMemo<DayRow[]>(() => {
    const now = moment()
    const base = moment().month(month).year(year).startOf('month')
    const limit = isCurrentMonth && !showAllDays ? now.date() : daysInMonth

    const entries: DayRow[] = []
    for (let d = 1; d <= limit; d++) {
      const day = moment(base).date(d)
      const dayDate = day.toDate()
      const dayKey = localDayKey(day)
      const reportsForDay = thisMonthsReports.filter(
        (r) => storedDayKey(r.date) === dayKey
      )

      const totalMinutes = reportsForDay.reduce(
        (acc, r) => acc + entryMinutes(r),
        0
      )
      const hoursLabel =
        reportsForDay.length === 0
          ? '—'
          : formatMinutes(totalMinutes, timeDisplayFormat).formatted

      const dayPlansForDay = dayPlansOnLocalDay(dayPlans, day)
      const recurringPlansForDay = getPlansIntersectingDay(
        dayDate,
        recurringPlans
      )
      const goalMinutes = plannedMinutesForDay(
        dayDate,
        dayPlansForDay,
        recurringPlansForDay
      )
      const hasPlan = goalMinutes > 0

      let planDotColor: string | null = null
      if (hasPlan) {
        const isTodayDate = now.isSame(day, 'day')
        const dateInPast = day.isSameOrBefore(now, 'day')
        const wentInService = reportsForDay.some(isCountableEntry)
        const hitGoal = totalMinutes >= goalMinutes
        planDotColor = getDateStatusColor(
          theme,
          wentInService,
          isTodayDate,
          dateInPast,
          hitGoal
        ).bg
      }

      let categoryLabel = '—'
      if (reportsForDay.length > 0) {
        // Group by stable identity: prefer categoryId (post-migration), fall
        // back to the legacy `tag` string for unmigrated entries, with
        // synthetic keys for rollover / plain-standard. LDC is keyed by its
        // builtin Category id like any other Category — `isLdcEntry` also
        // matches legacy `ldc: true` entries so unmigrated installs still
        // bucket correctly.
        const keyFor = (r: TimeEntry): string => {
          if (r.rollover) return '__rollover__'
          if (isLdcEntry(r)) return '__ldc__'
          if (r.categoryId) return `cat:${r.categoryId}`
          if (r.tag) return `tag:${r.tag}`
          return '__standard__'
        }
        const keys = new Set(reportsForDay.map(keyFor))
        if (keys.size > 1) {
          categoryLabel = i18n.t('multiple')
        } else {
          const [only] = Array.from(keys)
          if (only === '__rollover__') {
            categoryLabel = i18n.t('timeRollover_rowLabel')
          } else if (only === '__ldc__') {
            categoryLabel = i18n.t('ldc')
          } else if (only === '__standard__') {
            categoryLabel = i18n.t('standard')
          } else {
            // Either `cat:<id>` or `tag:<legacy>`. Resolve via the categories
            // store so the user-visible label always reflects the Category's
            // current name, not whatever was stamped at write time.
            categoryLabel =
              getCategoryLabel(reportsForDay[0], categories) ??
              only.replace(/^(cat:|tag:)/, '')
          }
        }
      }

      const isToday = isCurrentMonth && d === now.date()
      const isEmpty = reportsForDay.length === 0

      entries.push({
        date: dayDate,
        dayOfWeekLabel: day.format('ddd'),
        monthDayLabel: formatMonthDayCompact(day),
        isToday,
        hoursLabel,
        categoryLabel,
        // The dashes an empty row shows would be read as "dash, dash".
        accessibilityLabel: [
          formatDisplay(day, 'dddd'),
          formatMonthDayCompact(day),
          isToday && i18n.t('today'),
          ...(isEmpty
            ? [i18n.t('durationSpoken.noTime')]
            : [categoryLabel, formatMinutesSpoken(totalMinutes)]),
        ]
          .filter(Boolean)
          .join(', '),
        isEmpty,
        planDotColor,
        reports: reportsForDay,
        dayPlans: dayPlansForDay,
        recurringPlans: recurringPlansForDay,
      })
    }

    // Most-recent first
    return entries.sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [
    thisMonthsReports,
    month,
    year,
    categories,
    timeDisplayFormat,
    dayPlans,
    recurringPlans,
    theme,
    isCurrentMonth,
    daysInMonth,
    showAllDays,
  ])

  const compact = variant === 'compact'
  const headingStyle = {
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('xs'),
    textTransform: 'uppercase',
    letterSpacing: tracking(0.5),
  } as const

  const header = wrapHeader(
    <View
      style={{
        marginHorizontal: compact ? 0 : inset,
        paddingHorizontal: 15,
        paddingTop: compact ? 12 : 0,
        paddingBottom: compact ? 8 : 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        ...(compact
          ? { borderBottomWidth: 1, borderBottomColor: theme.colors.border }
          : {}),
      }}
    >
      <Text style={{ ...headingStyle, flex: 1 }} numberOfLines={1}>
        {i18n.t('date')}
      </Text>
      {/* Stacked rows put the category under the day, not in a column. */}
      {stacked ? null : (
        <Text style={headingStyle} numberOfLines={1}>
          {i18n.t('category')}
        </Text>
      )}
      <Text
        style={{ ...headingStyle, minWidth: 44, textAlign: alignText('end') }}
        numberOfLines={1}
      >
        {i18n.t('hours')}
      </Text>
      <View style={{ width: 12 }} />
    </View>
  )

  const rowItems = rows.map((row) => (
    <View
      key={row.date.toISOString()}
      ref={
        !compact && row.date.getTime() === sheet.date.getTime()
          ? dayReveal?.targetRef
          : undefined
      }
      collapsable={false}
    >
      <View
        ref={dayRef?.(moment(row.date).format('YYYY-MM-DD'))}
        collapsable={false}
      >
        <DayRowItem
          row={row}
          inset={inset}
          plain={compact}
          onPress={() => setSheet({ open: true, date: row.date })}
        />
      </View>
    </View>
  ))

  const futureToggle = hasFutureDays ? (
    <Button
      onPress={() => setShowAllDays((v) => !v)}
      style={{
        alignSelf: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          textDecorationLine: 'underline',
        }}
      >
        {showAllDays ? i18n.t('hideFutureDays') : i18n.t('showAllDays')}
      </Text>
    </Button>
  ) : null

  return (
    <View style={{ gap: 8 }}>
      {compact ? (
        <Card
          style={{
            paddingVertical: 0,
            paddingHorizontal: 0,
            gap: 0,
            overflow: 'hidden',
          }}
        >
          {header}
          <ScrollView
            // Each month starts at its latest day.
            key={`${year}-${month}`}
            nestedScrollEnabled
            // Grows with larger text so it still shows about four days.
            style={{ maxHeight: COMPACT_LIST_HEIGHT * Math.max(1, fontScale) }}
            contentContainerStyle={{ paddingBottom: futureToggle ? 0 : 4 }}
          >
            {rowItems}
            {futureToggle}
          </ScrollView>
        </Card>
      ) : (
        <View style={{ gap: 6 }}>
          {header}
          {rowItems}
          {futureToggle}
        </View>
      )}

      <SelectedDateSheet
        sheet={sheet}
        setSheet={setSheet}
        thisMonthsReports={thisMonthsReports}
        onHeightChange={compact ? undefined : dayReveal?.onSheetHeightChange}
        renderPlanForm={renderPlanForm}
        renderPlanDetails={renderPlanDetails}
      />
    </View>
  )
}

export default AllDaysList
