import { CalendarCheck as TodayIcon } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import AdaptiveSplitScrollView from '@/components/ui/layout/AdaptiveSplitScrollView'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'

import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { usePreferences } from '@/stores/preferences'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'

import YearMilestoneCard from '@/components/YearMilestoneCard'
import YearTotalCard from '@/features/progress/components/YearTotalCard'
import YearCategoryBreakdownSection from '@/features/progress/components/YearCategoryBreakdownSection'
import Text from '@/components/ui/MyText'
import { useNavigation } from '@react-navigation/native'
import type { RootStackNavigation } from '@/types/rootStack'
import Button from '@/components/ui/Button'
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
import ServiceYearPaceCard from '@/features/progress/components/ServiceYearPaceCard'
import GoalBar, { GoalBarKey } from '@/components/GoalBar'
import useServiceYearPace from '@/features/progress/hooks/useServiceYearPace'

interface ProgressYearTabProps {
  /** End year of the service year (Sep 1 of `year - 1` → Aug 31 of `year`). */
  year: number
  /** Invoked when the user taps "adjust milestones" on the hero card. */
  onAdjustMilestones: () => void
  /** Invoked when the user taps a month row — parent switches to Month tab. */
  onMonthPress: (month: number, year: number) => void
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

/**
 * One row per month in the service year: `{MMM} {hours}h {+delta}` over a bar
 * drawn on the year's shared scale. Tap → Month tab for that month; long-press
 * → the month's report preview and actions.
 */
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
  /** What remaining Plans add to the month after its credit cap. */
  plannedMinutes: number
  barScaleMinutes: number
  onPress: () => void
  onEdit: (target: MonthEditTarget) => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
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

  // Only show delta when there's a meaningful goal and at least some activity,
  // or when the month is in the past (so an all-zero past month reads as a
  // miss). Future months with no activity should stay visually quiet.
  const hasActivity = completedMinutes > 0
  const showDelta = goalHours > 0 && hasActivity
  // Future months haven't happened yet — surface planned hours instead of a
  // bare "0h", styled with textAlt so the eye still reads it as upcoming.
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

  const monthYearLabel = moment().month(month).year(year).format('MMMM, YYYY')
  const editable = monthEditTargets({ month, year, baseGoalHours })

  return (
    <ContextMenu
      onPress={onPress}
      accessibilityLabel={monthYearLabel}
      preview={
        <MonthSummaryPreview
          month={month}
          year={year}
          completedMinutes={completedMinutes}
          goalMinutes={goalMinutes}
          statusLabel={monthStatus.label}
          showsTime={showsTimeEntry}
          sharedInMinistry={monthsReports.length > 0}
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
          !isFuture &&
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
        <XView style={styles.columns}>
          <View style={[styles.monthColumn, { gap: 4 }]}>
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
          <Text
            style={[
              styles.numericColumn,
              {
                fontFamily: theme.fonts.semiBold,
                color: hasActivity ? theme.colors.text : theme.colors.textAlt,
                letterSpacing: -0.3,
                textAlign: 'right',
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
                styles.numericColumn,
                {
                  fontFamily: theme.fonts.semiBold,
                  color: deltaColor,
                  letterSpacing: -0.3,
                  textAlign: 'right',
                },
              ]}
            >
              {deltaLabel}
            </Text>
          ) : (
            <View style={styles.numericColumn} />
          )}
        </XView>
        {/* Every row shares one scale, so the bars compare down the list. The
          columns above carry the numbers; the key under the header explains
          the marks. */}
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

/**
 * Service-year tab body. Renders the milestone hero card at the top and then an
 * "ALL MONTHS" list — one compact row per month across the service year.
 * Service years run Sep → Aug (12 months), so month order here is `[8, 9, 10,
 * 11, 0, 1, 2, 3, 4, 5, 6, 7]`.
 */
const ProgressYearTab = ({
  year,
  onAdjustMilestones,
  onMonthPress,
}: ProgressYearTabProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { hasSidebar } = useAdaptiveLayout()

  const navigation = useNavigation<RootStackNavigation>()
  // One pair of status/goal sheets for every row; `target` null = closed.
  const [editing, setEditing] = useState<{
    month: number
    year: number
    target: MonthEditTarget | null
  }>({ month: moment().month(), year: moment().year(), target: null })
  const now = moment()
  const currentMonth = now.month()
  const currentYear = now.year()
  // Service History covers finished months only.
  const hasPastMonths = moment({ year: year - 1, month: 8 }).isBefore(
    now,
    'month'
  )

  // Pairs of (monthIndex, calendarYear) for the service year span.
  const months = useMemo(() => {
    const list: { month: number; year: number }[] = []
    // Aug(7) → Jan(0) of year
    for (let m = 7; m >= 0; m--) {
      list.push({ month: m, year })
    }
    //  Dec(11) → Sep(8) of year - 1
    for (let m = 11; m >= 8; m--) {
      list.push({ month: m, year: year - 1 })
    }
    return list
  }, [year])

  const { hasAnnualGoal, monthlyGoalHours, milestones } = usePublisher(
    serviceYearFocusMonth(year - 1)
  )
  const showDeltaColumn = monthlyGoalHours > 0
  const paceData = useServiceYearPace(year - 1)
  const { monthBars } = paceData

  return (
    <AdaptiveSplitScrollView
      paddingTop={0}
      paddingBottom={insets.bottom + (hasSidebar ? 30 : 100)}
      leading={
        <View style={{ gap: 24 }}>
          {/* Roles without an Annual Goal get a raw service-year total instead
            of the milestone hero, and no projection (there is nothing to
            project against). */}
          {hasAnnualGoal ? (
            <>
              <YearMilestoneCard
                year={year}
                onAdjustMilestones={onAdjustMilestones}
                categoriesSlot={<YearCategoryBreakdownSection year={year} />}
                separateMilestones
              />
              <ServiceYearPaceCard data={paceData} milestones={milestones} />
            </>
          ) : (
            <YearTotalCard
              year={year}
              categoriesSlot={<YearCategoryBreakdownSection year={year} />}
            />
          )}
        </View>
      }
      trailing={
        <View style={{ gap: 8, paddingTop: 10 }}>
          <View style={{ gap: 6 }}>
            <XView
              style={[
                styles.columns,
                { paddingHorizontal: 16, paddingBottom: 2 },
              ]}
            >
              <Text
                style={[
                  styles.monthColumn,
                  {
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('xs'),
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  },
                ]}
                numberOfLines={1}
              >
                {i18n.t('month')}
              </Text>
              <Text
                style={[
                  styles.numericColumn,
                  {
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('xs'),
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    textAlign: 'right',
                  },
                ]}
                numberOfLines={1}
              >
                {i18n.t('hours')}
              </Text>
              {showDeltaColumn ? (
                <Text
                  style={[
                    styles.numericColumn,
                    {
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('xs'),
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      textAlign: 'right',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {i18n.t('vsGoal')}
                </Text>
              ) : (
                <View style={styles.numericColumn} />
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
              // Service Year months run September (0) through August (11).
              const paceMonth =
                paceData.pace.months[
                  calendarYear * 12 + month - ((year - 1) * 12 + 8)
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
          {hasPastMonths ? (
            <Button
              noTransform
              accessibilityRole='button'
              variant='outline'
              onPress={() =>
                navigation.navigate('ServiceHistory', {
                  serviceYear: year - 1,
                  source: 'year_tab',
                })
              }
              style={{ justifyContent: 'center', paddingVertical: 12 }}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('serviceHistory.edit')}
              </Text>
            </Button>
          ) : null}
          <MonthStatusGoalSheets
            month={editing.month}
            year={editing.year}
            editing={editing.target}
            onClose={() => setEditing({ ...editing, target: null })}
            source='year_tab'
          />
        </View>
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
})

export default ProgressYearTab
