import { CalendarCheck as TodayIcon } from 'lucide-react-native'
import {
  type ReactElement,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import { serviceYearMonthIndex } from '@/lib/serviceYear'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { usePreferences } from '@/stores/preferences'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  isCountableEntry,
} from '@/lib/serviceReport'
import { useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import type { RootStackNavigation } from '@/types/rootStack'
import LucideIcon from '@/components/ui/LucideIcon'
import XView from '@/components/ui/layout/XView'
import Card, { useCardStyle } from '@/components/ui/Card'
import PeekScrollView from '@/components/ui/PeekScrollView'
import { peekWindowHeight, peekWindowTopIndex } from '@/lib/peekWindow'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import useMonthStatus from '@/features/service-reports/hooks/useMonthStatus'
import useMonthReportExport from '@/features/service-reports/hooks/useMonthReportExport'
import MonthStatusGoalSheets from '@/features/service-reports/components/MonthStatusGoalSheets'
import {
  monthEditTargets,
  type MonthEditTarget,
} from '@/features/service-reports/lib/monthEditTargets'
import MonthSummaryPreview from '@/features/service-reports/components/MonthSummaryPreview'
import ContextMenu from '@/components/ui/ContextMenu'
import GoalBar, { GoalBarKey } from '@/components/GoalBar'
import useServiceYearPace from '@/features/progress/hooks/useServiceYearPace'
import type { YearCardProps } from '@/features/progress/components/cards/types'
import { alignText } from '@/lib/direction'
import { tracking } from '@/lib/tracking'
import { formatDisplay } from '@/lib/dates'

export const COMPACT_MONTH_ROWS = 3

const COMPACT_ROW_ESTIMATE = 70

const CurrentMonthIcon = () => {
  const theme = useTheme()

  return (
    <View
      accessible
      accessibilityRole='image'
      accessibilityLabel={i18n.t('today')}
      style={{
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <LucideIcon
        icon={TodayIcon}
        size={15}
        strokeWidth={2.5}
        color={theme.colors.accent}
      />
    </View>
  )
}

const RowBadge = ({ label }: { label: string }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.accentTranslucent,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: theme.colors.accent,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {label}
      </Text>
    </View>
  )
}

const MonthRow = ({
  month,
  year,
  isCurrent,
  isFuture,
  plannedMinutes,
  barScaleMinutes,
  plain = false,
  divider = false,
  onPress,
  onEdit,
}: {
  month: number
  year: number
  isCurrent: boolean
  isFuture: boolean

  plannedMinutes: number
  barScaleMinutes: number

  plain?: boolean
  divider?: boolean
  onPress: () => void
  onEdit: (target: MonthEditTarget) => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()

  const stacked = useAccessibilityTextSize()
  const numericColumn = stacked ? styles.stackedColumn : styles.numericColumn
  const navigation = useNavigation<RootStackNavigation>()
  const { reportMenuItems } = useMonthReportExport()
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences()
  const { type: role, showsTimeEntry } = usePublisher({ month, year })
  const monthStatus = useMonthStatus({ month, year })
  const serviceReports = useServiceReport((s) => s.serviceReports)

  const {
    baseGoalHours,
    effectiveGoalHours: goalHours,
    isOverridden,
  } = useMonthlyGoal({
    month,
    year,
  })

  const monthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [serviceReports, month, year]
  )

  const adjusted = useMemo(
    () =>
      adjustedMinutesForSpecificMonth(monthsReports, month, year, role, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      }),
    [
      monthsReports,
      month,
      year,
      role,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )
  const completedMinutes = adjusted.value

  const completedDisplay = useFormattedMinutes(completedMinutes)
  const plannedDisplay = useFormattedMinutes(plannedMinutes)
  const goalMinutes = Math.round(goalHours * 60)
  const goalDisplay = useFormattedMinutes(goalMinutes)
  const deltaMinutes = completedMinutes - goalMinutes
  const deltaDisplay = useFormattedMinutes(Math.abs(deltaMinutes))

  const hasActivity = completedMinutes > 0
  const showDelta = goalHours > 0 && hasActivity

  const showFuturePlanned = isFuture && !hasActivity && plannedMinutes > 0

  const deltaLabel =
    deltaMinutes === 0
      ? deltaDisplay.formatted
      : `${deltaMinutes > 0 ? '+' : '-'}${deltaDisplay.formatted}`
  const deltaColor =
    !showDelta || deltaMinutes === 0
      ? theme.colors.textAlt
      : deltaMinutes > 0
        ? theme.colors.accent
        : theme.colors.warn

  const monthYearLabel = formatDisplay(
    moment().month(month).year(year),
    'MMMM, YYYY'
  )
  const editable = monthEditTargets({ month, year, baseGoalHours })

  const monthColumn = (
    <View style={[!stacked && styles.monthColumn, { gap: 4 }]}>
      <XView style={{ gap: 8 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
            color: theme.colors.text,
            flexShrink: 1,
          }}
        >
          {monthYearLabel}
        </Text>
        {isCurrent ? <CurrentMonthIcon /> : null}
      </XView>
      {isOverridden || monthStatus.isDifferent ? (
        <XView style={{ gap: 6, flexWrap: 'wrap' }}>
          {monthStatus.isDifferent ? (
            <RowBadge label={monthStatus.label} />
          ) : null}
          {isOverridden ? (
            <RowBadge
              label={i18n.t('monthGoalEditor.goalBadge', {
                goal: goalDisplay.formatted,
              })}
            />
          ) : null}
        </XView>
      ) : null}
    </View>
  )
  const figures = (
    <>
      <Text
        style={[
          numericColumn,
          {
            fontFamily: theme.fonts.semiBold,
            color: hasActivity ? theme.colors.text : theme.colors.textAlt,
            letterSpacing: tracking(-0.3),
            textAlign: alignText('end'),
          },
        ]}
      >
        {showFuturePlanned
          ? plannedDisplay.formatted
          : completedDisplay.formatted}
      </Text>
      {showDelta ? (
        <Text
          style={[
            numericColumn,
            {
              fontFamily: theme.fonts.semiBold,
              color: deltaColor,
              letterSpacing: tracking(-0.3),
              textAlign: alignText('end'),
            },
          ]}
        >
          {deltaLabel}
        </Text>
      ) : (
        <View style={numericColumn} />
      )}
    </>
  )

  return (
    <ContextMenu
      onPress={onPress}
      hoverRadius={plain ? 0 : cardStyle.borderRadius}
      accessibilityLabel={monthYearLabel}
      preview={
        <MonthSummaryPreview
          month={month}
          year={year}
          completedMinutes={completedMinutes}
          goalMinutes={goalMinutes}
          statusLabel={monthStatus.label}
          showsTime={showsTimeEntry}
          sharedInMinistry={monthsReports.some(isCountableEntry)}
        />
      }
      actions={[
        [
          {
            id: 'view_report',
            title: i18n.t('viewReport'),
            systemImage: 'doc.text',
            onPress: () =>
              navigation.navigate('ServiceReportView', { month, year }),
          },
          showsTimeEntry && {
            id: 'add_time',
            title: i18n.t('addTime'),
            systemImage: 'plus',
            onPress: () =>
              navigation.navigate('Add Time', {
                date: moment().month(month).year(year).toISOString(),
              }),
          },
        ],
        !isFuture && reportMenuItems(month, year),
        [
          editable.status && {
            id: 'change_status',
            title: i18n.t('changeStatusEllipsis'),
            systemImage: 'person.crop.circle',
            onPress: () => onEdit('status'),
          },
          editable.goal && {
            id: 'change_goal',
            title: i18n.t('changeGoalEllipsis'),
            systemImage: 'target',
            onPress: () => onEdit('goal'),
          },
        ],
      ]}
    >
      <View
        style={{
          ...(plain
            ? {
                borderBottomWidth: divider ? 1 : 0,
                borderBottomColor: theme.colors.border,
              }
            : cardStyle),
          paddingHorizontal: plain ? 16 : 15,
          paddingVertical: 12,
          gap: 8,
        }}
      >
        {stacked ? (
          <>
            {monthColumn}
            <XView style={styles.columns}>{figures}</XView>
          </>
        ) : (
          <XView style={styles.columns}>
            {monthColumn}
            {figures}
          </XView>
        )}
        <GoalBar
          loggedMinutes={completedMinutes}
          creditMinutes={adjusted.credit}
          plannedMinutes={plannedMinutes}
          goalMinutes={goalMinutes}
          scaleMinutes={barScaleMinutes}
          labels={false}
        />
      </View>
    </ContextMenu>
  )
}

export default function YearMonthsCard({
  serviceYear,
  size,
  onMonthPress,
  wrapHeader = (header) => header,
}: YearCardProps & {
  onMonthPress: (month: number, year: number) => void

  wrapHeader?: (header: ReactElement) => ReactElement
}) {
  const theme = useTheme()
  const { fontScale } = useWindowDimensions()
  const year = serviceYear + 1
  const compact = size === 'compact'

  const [editing, setEditing] = useState<{
    month: number
    year: number
    target: MonthEditTarget | null
  }>({ month: moment().month(), year: moment().year(), target: null })
  const now = moment()
  const currentMonth = now.month()
  const currentYear = now.year()

  const months = useMemo(() => {
    const list: { month: number; year: number }[] = []

    for (let m = 7; m >= 0; m--) {
      list.push({ month: m, year })
    }

    for (let m = 11; m >= 8; m--) {
      list.push({ month: m, year: year - 1 })
    }
    return list
  }, [year])

  const { monthlyGoalHours } = usePublisher(serviceYearFocusMonth(serviceYear))
  const showDeltaColumn = monthlyGoalHours > 0

  const stacked = useAccessibilityTextSize()
  const numericColumn = stacked ? styles.stackedColumn : styles.numericColumn
  const paceData = useServiceYearPace(serviceYear)
  const { monthBars } = paceData

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
        gap: 6,
        paddingHorizontal: 16,
        paddingTop: compact ? 18 : 0,
        paddingBottom: compact ? 12 : 2,
        ...(compact
          ? { borderBottomWidth: 1, borderBottomColor: theme.colors.border }
          : {}),
      }}
    >
      <XView style={styles.columns}>
        {stacked ? null : (
          <Text style={[styles.monthColumn, headingStyle]} numberOfLines={1}>
            {i18n.t('month')}
          </Text>
        )}
        <Text
          style={[numericColumn, headingStyle, { textAlign: alignText('end') }]}
          numberOfLines={stacked ? undefined : 1}
        >
          {i18n.t('hours')}
        </Text>
        {showDeltaColumn ? (
          <Text
            style={[
              numericColumn,
              headingStyle,
              { textAlign: alignText('end') },
            ]}
            numberOfLines={stacked ? undefined : 1}
          >
            {i18n.t('vsGoal')}
          </Text>
        ) : (
          <View style={numericColumn} />
        )}
      </XView>
      {monthBars.scaleMinutes > 0 ? (
        <GoalBarKey
          credit={monthBars.hasCredit}
          planned={monthBars.hasPlanned}
          goal={monthBars.hasGoal}
        />
      ) : null}
    </View>
  )

  const currentIndex = months.findIndex(
    (m) => m.month === currentMonth && m.year === currentYear
  )

  const topIndex = peekWindowTopIndex({
    count: months.length,
    visibleRows: COMPACT_MONTH_ROWS,
    focusIndex: currentIndex < 0 ? null : currentIndex,
  })
  const listRef = useRef<ScrollView>(null)
  const [rowHeight, setRowHeight] = useState(0)
  const leadY = useRef<number | null>(null)
  const openOnLeadRow = (y: number) => {
    leadY.current = y
    listRef.current?.scrollTo({ y, animated: false })
  }
  useLayoutEffect(() => {
    if (leadY.current !== null)
      listRef.current?.scrollTo({ y: leadY.current, animated: false })
  }, [rowHeight])

  const rows = months.map(({ month, year: calendarYear }, index) => {
    const isFuture =
      calendarYear > currentYear ||
      (calendarYear === currentYear && month > currentMonth)
    const paceMonth =
      paceData.pace.months[
        serviceYearMonthIndex({ year: calendarYear, month }, serviceYear)
      ]
    return (
      <View
        key={`${calendarYear}-${month}`}
        collapsable={false}
        onLayout={
          compact && (index === topIndex || index === 0)
            ? (e) => {
                const { y, height } = e.nativeEvent.layout
                if (index === 0) setRowHeight(height)
                if (index === topIndex) openOnLeadRow(y)
              }
            : undefined
        }
      >
        <MonthRow
          month={month}
          year={calendarYear}
          isCurrent={index === currentIndex}
          isFuture={isFuture}
          plannedMinutes={paceMonth?.plannedMinutes ?? 0}
          barScaleMinutes={monthBars.scaleMinutes}
          plain={compact}
          divider={index < months.length - 1}
          onPress={() => onMonthPress(month, calendarYear)}
          onEdit={(target) => setEditing({ month, year: calendarYear, target })}
        />
      </View>
    )
  })

  return (
    <View>
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
          <PeekScrollView
            key={serviceYear}
            ref={listRef}
            height={peekWindowHeight(
              months.length,
              COMPACT_MONTH_ROWS,
              rowHeight || COMPACT_ROW_ESTIMATE * Math.max(1, fontScale)
            )}
            fadeColor={theme.colors.card}
          >
            {rows}
          </PeekScrollView>
        </Card>
      ) : (
        <View style={{ gap: 6 }}>
          {header}
          {rows}
        </View>
      )}
      <MonthStatusGoalSheets
        month={editing.month}
        year={editing.year}
        editing={editing.target}
        onClose={() => setEditing({ ...editing, target: null })}
        source='year_tab'
      />
    </View>
  )
}

const styles = StyleSheet.create({
  columns: {
    justifyContent: 'space-between',
    gap: 12,
  },
  monthColumn: {
    flex: 1,
    minWidth: 0,
  },
  numericColumn: {
    width: '25%',
    minWidth: 0,
  },
  stackedColumn: {
    flex: 1,
    minWidth: 0,
  },
})
