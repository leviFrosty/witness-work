import { CalendarCheck as TodayIcon } from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import AdaptiveSplitScrollView from '@/components/ui/layout/AdaptiveSplitScrollView'
import type { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import useReorderScroller from '@/components/ui/reorderable/useReorderScroller'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'
import useTabReselect from '@/hooks/useTabReselect'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'
import { serviceYearMonthIndex } from '@/lib/serviceYear'

import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { usePreferences } from '@/stores/preferences'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  isCountableEntry,
} from '@/lib/serviceReport'
import { useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'

import YearMilestoneCard from '@/components/YearMilestoneCard'
import YearTotalCard from '@/features/progress/components/YearTotalCard'
import YearCategoryBreakdownSection from '@/features/progress/components/YearCategoryBreakdownSection'
import Text from '@/components/ui/MyText'
import { useNavigation } from '@react-navigation/native'
import type { RootStackNavigation } from '@/types/rootStack'
import LucideIcon from '@/components/ui/LucideIcon'
import XView from '@/components/ui/layout/XView'
import { useCardStyle } from '@/components/ui/Card'
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
import YearProgressCards from '@/features/progress/components/cards/year/YearProgressCards'
import RestWhileEditing from '@/features/progress/components/cards/RestWhileEditing'
import type { ProgressCardEditStart } from '@/features/progress/components/cards/ProgressCardGrid'
import type { ProgressCardDestination } from '@/features/progress/components/cards/progressCardRegistry'
import useServiceYearPace from '@/features/progress/hooks/useServiceYearPace'
import { alignText } from '@/lib/direction'
import { tracking } from '@/lib/tracking'
import { formatDisplay } from '@/lib/dates'

interface ProgressYearTabProps {
  year: number

  onAdjustMilestones: () => void

  onMonthPress: (month: number, year: number) => void

  scrollBars?: HideBarsScrollProps

  editing: boolean
  onStartEditing: (source: ProgressCardEditStart) => void
  onFinishEditing: () => void

  adding: boolean
  onAddingChange: (adding: boolean) => void
  onNavigate: (destination: ProgressCardDestination) => void
}

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
  onPress,
  onEdit,
}: {
  month: number
  year: number
  isCurrent: boolean
  isFuture: boolean

  plannedMinutes: number
  barScaleMinutes: number
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
      hoverRadius={cardStyle.borderRadius}
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
          ...cardStyle,
          paddingHorizontal: 15,
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
        {}
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

const ProgressYearTab = ({
  year,
  onAdjustMilestones,
  onMonthPress,
  scrollBars,
  editing: editingCards,
  onStartEditing,
  onFinishEditing,
  adding,
  onAddingChange,
  onNavigate,
}: ProgressYearTabProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { hasBottomBar } = useAdaptiveLayout()
  const scrollRef = useRef<KeyboardAwareScrollView>(null)
  const scroller = useReorderScroller(scrollRef, {
    obscuredBottom: hasBottomBar ? insets.bottom + TAB_BAR_HEIGHT : 0,
  })
  const [dragging, setDragging] = useState(false)

  useTabReselect(() => scrollRef.current?.scrollToPosition(0, 0, true))

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

  const { hasAnnualGoal, monthlyGoalHours } = usePublisher(
    serviceYearFocusMonth(year - 1)
  )
  const showDeltaColumn = monthlyGoalHours > 0

  const stacked = useAccessibilityTextSize()
  const numericColumn = stacked ? styles.stackedColumn : styles.numericColumn
  const paceData = useServiceYearPace(year - 1)
  const { monthBars } = paceData

  return (
    <AdaptiveSplitScrollView
      scrollBars={scrollBars}
      paddingTop={0}
      paddingBottom={insets.bottom + (hasBottomBar ? 100 : 30)}
      leadingReorder={{ scrollRef, scroller, scrollEnabled: !dragging }}
      leading={
        <View style={{ gap: 24 }}>
          {}
          <RestWhileEditing
            editing={editingCards}
            onFinishEditing={onFinishEditing}
          >
            {hasAnnualGoal ? (
              <YearMilestoneCard
                year={year}
                onAdjustMilestones={onAdjustMilestones}
                categoriesSlot={<YearCategoryBreakdownSection year={year} />}
                separateMilestones
              />
            ) : (
              <YearTotalCard
                year={year}
                categoriesSlot={<YearCategoryBreakdownSection year={year} />}
              />
            )}
          </RestWhileEditing>
          <YearProgressCards
            serviceYear={year - 1}
            editing={editingCards}
            onStartEditing={onStartEditing}
            onFinishEditing={onFinishEditing}
            adding={adding}
            onAddingChange={onAddingChange}
            onNavigate={onNavigate}
            scroller={scroller.scroller}
            onDragChange={setDragging}
          />
        </View>
      }
      trailing={
        <RestWhileEditing
          editing={editingCards}
          onFinishEditing={onFinishEditing}
        >
          <View style={{ gap: 8, paddingTop: 10 }}>
            <View style={{ gap: 6 }}>
              <XView
                style={[
                  styles.columns,
                  { paddingHorizontal: 16, paddingBottom: 2 },
                ]}
              >
                {stacked ? null : (
                  <Text
                    style={[
                      styles.monthColumn,
                      {
                        fontFamily: theme.fonts.semiBold,
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('xs'),
                        textTransform: 'uppercase',
                        letterSpacing: tracking(0.5),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {i18n.t('month')}
                  </Text>
                )}
                <Text
                  style={[
                    numericColumn,
                    {
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('xs'),
                      textTransform: 'uppercase',
                      letterSpacing: tracking(0.5),
                      textAlign: alignText('end'),
                    },
                  ]}
                  numberOfLines={stacked ? undefined : 1}
                >
                  {i18n.t('hours')}
                </Text>
                {showDeltaColumn ? (
                  <Text
                    style={[
                      numericColumn,
                      {
                        fontFamily: theme.fonts.semiBold,
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('xs'),
                        textTransform: 'uppercase',
                        letterSpacing: tracking(0.5),
                        textAlign: alignText('end'),
                      },
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
                <View style={{ paddingHorizontal: 16, paddingBottom: 2 }}>
                  <GoalBarKey
                    credit={monthBars.hasCredit}
                    planned={monthBars.hasPlanned}
                    goal={monthBars.hasGoal}
                  />
                </View>
              ) : null}
              {months.map(({ month, year: calendarYear }) => {
                const isCurrent =
                  month === currentMonth && calendarYear === currentYear
                const isFuture =
                  calendarYear > currentYear ||
                  (calendarYear === currentYear && month > currentMonth)
                const paceMonth =
                  paceData.pace.months[
                    serviceYearMonthIndex(
                      { year: calendarYear, month },
                      year - 1
                    )
                  ]
                return (
                  <MonthRow
                    key={`${calendarYear}-${month}`}
                    month={month}
                    year={calendarYear}
                    isCurrent={isCurrent}
                    isFuture={isFuture}
                    plannedMinutes={paceMonth?.plannedMinutes ?? 0}
                    barScaleMinutes={monthBars.scaleMinutes}
                    onPress={() => onMonthPress(month, calendarYear)}
                    onEdit={(target) =>
                      setEditing({ month, year: calendarYear, target })
                    }
                  />
                )
              })}
            </View>
            <MonthStatusGoalSheets
              month={editing.month}
              year={editing.year}
              editing={editing.target}
              onClose={() => setEditing({ ...editing, target: null })}
              source='year_tab'
            />
          </View>
        </RestWhileEditing>
      }
    />
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

export default ProgressYearTab
