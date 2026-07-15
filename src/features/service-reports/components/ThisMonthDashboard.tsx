import { useNavigation } from '@react-navigation/native'
import {
  ArrowUpRight as ArrowUpRightIcon,
  CalendarRange as CalendarRangeIcon,
  ChartLine as ChartLineIcon,
  Clock3 as ClockIcon,
  Gauge as GaugeIcon,
  Pencil as PencilIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { useRef, useState } from 'react'
import { Pressable, View } from 'react-native'

import SchedulePaceInsight from '@/components/SchedulePaceInsight'
import Card from '@/components/ui/Card'
import CircularProgress from '@/components/ui/CircularProgress'
import ExpandingCardOverlay, {
  type ExpandingCardOrigin,
} from '@/components/ui/ExpandingCardOverlay'
import IconButton from '@/components/ui/IconButton'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import usePublisher from '@/hooks/usePublisher'
import useScheduleStatus from '@/hooks/useScheduleStatus'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { calculateMonthlyPlannedMinutesOptimized } from '@/lib/recurrence'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import type { HomeTabStackNavigation } from '@/types/homeStack'

export const THIS_MONTH_DASHBOARD_CARD_KEYS = [
  'schedulePace',
  'projectedMonth',
  'serviceYearProgress',
  'creditTime',
  'remainingToGoal',
  'plannedTotal',
] as const

export type ThisMonthDashboardCardKey =
  (typeof THIS_MONTH_DASHBOARD_CARD_KEYS)[number]

type Props = {
  visibleCardKeys: readonly ThisMonthDashboardCardKey[]
  orderedCardKeys: readonly ThisMonthDashboardCardKey[]
  onEdit: () => void
}

type DashboardCard = {
  key: ThisMonthDashboardCardKey
  icon: AppIcon
  value: string
  label: string
  color?: string
  destination: 'Progress' | 'Schedule'
  progress?: number
  progressDisplay?: 'bar' | 'ring'
  detail: {
    title: string
    headline: string
    meta?: string
    progress?: number
    stats: { label: string; value: string }[]
    description: string
  }
}

const DashboardDetailStat = ({
  label,
  value,
}: {
  label: string
  value: string
}) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flex: 1,
        gap: 4,
        padding: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('xs'),
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
        }}
      >
        {value}
      </Text>
    </View>
  )
}

const DashboardTile = ({
  card,
  onNavigate,
}: {
  card: DashboardCard
  onNavigate: () => void
}) => {
  const theme = useTheme()
  const cardRef = useRef<View>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [origin, setOrigin] = useState<ExpandingCardOrigin | null>(null)

  const openDetail = () => {
    cardRef.current?.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y, width, height })
      setDetailOpen(true)
    })
  }

  const navigateFromDetail = () => {
    setDetailOpen(false)
    setTimeout(onNavigate, 150)
  }

  return (
    <>
      <View ref={cardRef} collapsable={false} style={{ width: '48.5%' }}>
        <Pressable
          onPress={openDetail}
          accessibilityRole='button'
          accessibilityLabel={`${card.label}. ${card.value}`}
          accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Card
            style={{
              minHeight: 112,
              padding: 12,
              gap: 10,
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flex: 1, justifyContent: 'space-between', gap: 10 }}>
              {card.progressDisplay === 'ring' &&
              card.progress !== undefined ? (
                <CircularProgress
                  progress={card.progress}
                  size={30}
                  strokeWidth={4}
                  color={card.color ?? theme.colors.accent}
                  trackColor={theme.colors.border}
                />
              ) : (
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.backgroundLighter,
                  }}
                >
                  <LucideIcon
                    icon={card.icon}
                    color={card.color ?? theme.colors.textAlt}
                    size={16}
                  />
                </View>
              )}

              <View
                style={{
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      color: card.color ?? theme.colors.text,
                      fontFamily: theme.fonts.bold,
                      fontSize: theme.fontSize('lg'),
                    }}
                  >
                    {card.value}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      color: theme.colors.textAlt,
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {card.label}
                  </Text>
                  {card.progress !== undefined &&
                  card.progressDisplay !== 'ring' ? (
                    <SimpleProgressBar
                      percentage={card.progress}
                      color={card.color ?? theme.colors.accent}
                      height={4}
                      animated={false}
                    />
                  ) : null}
                </View>
              </View>
            </View>
          </Card>
        </Pressable>
      </View>

      <ExpandingCardOverlay
        origin={origin}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            <LucideIcon
              icon={card.icon}
              color={card.color ?? theme.colors.textAlt}
              size={16}
            />
          </View>
          <Text
            accessibilityRole='header'
            style={{
              flex: 1,
              color: theme.colors.text,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {card.detail.title}
          </Text>
          <IconButton
            icon={ArrowUpRightIcon}
            size='lg'
            noTransform
            onPress={navigateFromDetail}
            accessibilityLabel={i18n.t('homeDashboard.openDestination', {
              destination: i18n.t(
                card.destination === 'Schedule' ? 'schedule' : 'progress'
              ),
            })}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: card.color ?? theme.colors.text,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('2xl'),
            }}
          >
            {card.detail.headline}
          </Text>
          {card.detail.meta ? (
            <Text style={{ color: theme.colors.textAlt }}>
              {card.detail.meta}
            </Text>
          ) : null}
          {card.detail.progress !== undefined ? (
            <SimpleProgressBar
              percentage={card.detail.progress}
              color={card.color ?? theme.colors.accent}
              height={8}
              animated={false}
            />
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {card.detail.stats.map((stat) => (
            <DashboardDetailStat key={stat.label} {...stat} />
          ))}
        </View>

        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            lineHeight: 19,
          }}
        >
          {card.detail.description}
        </Text>
      </ExpandingCardOverlay>
    </>
  )
}

/** A glanceable, customizable month dashboard for Home. */
const ThisMonthDashboard = ({
  visibleCardKeys,
  orderedCardKeys,
  onEdit,
}: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<HomeTabStackNavigation>()
  const now = moment()
  const month = now.month()
  const year = now.year()
  const serviceYear = getServiceYearFromDate(now)
  const {
    entryMode,
    hasAnnualGoal,
    annualGoalHours,
    type: publisher,
  } = usePublisher()
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences()
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)

  const goalMinutes = Math.round(effectiveGoalHours * 60)
  const { projection: monthProjection } = useProjectedTotal(
    { kind: 'month', month, year },
    goalMinutes
  )
  const { projection: yearProjection } = useProjectedTotal(
    { kind: 'serviceYear', serviceYear },
    annualGoalHours * 60
  )
  const scheduleStatus = useScheduleStatus({ month, year })
  const totalPlannedMinutes = calculateMonthlyPlannedMinutesOptimized(
    month,
    year,
    dayPlans,
    recurringPlans
  )
  const monthAdjusted = adjustedMinutesForSpecificMonth(
    getMonthsReports(serviceReports, month, year),
    month,
    year,
    publisher,
    {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    }
  )

  const projected = useFormattedMinutes(monthProjection.projectedMinutes)
  const yearLogged = useFormattedMinutes(yearProjection.loggedMinutes)
  const credit = useFormattedMinutes(monthAdjusted.credit)
  const remaining = useFormattedMinutes(
    Math.max(0, goalMinutes - monthProjection.loggedMinutes)
  )
  const planned = useFormattedMinutes(totalPlannedMinutes)
  const paceActual = useFormattedMinutes(scheduleStatus.actualMinutes)
  const pacePlanned = useFormattedMinutes(scheduleStatus.plannedMinutes)
  const monthLogged = useFormattedMinutes(monthProjection.loggedMinutes)
  const monthEffectivePlanned = useFormattedMinutes(
    monthProjection.plannedMinutes
  )
  const goal = useFormattedMinutes(goalMinutes)
  const yearProjected = useFormattedMinutes(yearProjection.projectedMinutes)
  const yearPlanned = useFormattedMinutes(yearProjection.plannedMinutes)
  const annualGoal = useFormattedMinutes(annualGoalHours * 60)
  const standard = useFormattedMinutes(monthAdjusted.standard)
  const adjustedTotal = useFormattedMinutes(monthAdjusted.value)

  const hasMonthlyGoal = entryMode === 'hours' && goalMinutes > 0
  const monthGoalProgress =
    goalMinutes > 0 ? monthProjection.loggedMinutes / goalMinutes : 0
  const monthProjectedProgress =
    goalMinutes > 0 ? monthProjection.projectedMinutes / goalMinutes : 0
  const yearProgress =
    annualGoalHours > 0
      ? yearProjection.loggedMinutes / (annualGoalHours * 60)
      : 0

  const cards: DashboardCard[] = [
    ...(hasMonthlyGoal
      ? [
          {
            key: 'projectedMonth' as const,
            icon: ChartLineIcon,
            value: projected.formatted,
            label: i18n.t('projectedTotal.headerMonth'),
            destination: 'Progress' as const,
            detail: {
              title: i18n.t('projectedTotal.headerMonth'),
              headline: projected.formatted,
              meta: i18n.t('homeDashboard.details.ofGoal', {
                goal: goal.formatted,
              }),
              progress: monthProjectedProgress,
              stats: [
                {
                  label: i18n.t('homeDashboard.details.logged'),
                  value: monthLogged.formatted,
                },
                {
                  label: i18n.t('planned'),
                  value: monthEffectivePlanned.formatted,
                },
              ],
              description: i18n.t('homeDashboard.details.projectedMonth'),
            },
          },
        ]
      : []),
    ...(hasAnnualGoal && annualGoalHours > 0
      ? [
          {
            key: 'serviceYearProgress' as const,
            icon: GaugeIcon,
            value: yearLogged.formatted,
            label: i18n.t('serviceYear'),
            destination: 'Progress' as const,
            progress: yearProgress,
            detail: {
              title: i18n.t('homeDashboard.editor.cards.serviceYearProgress'),
              headline: yearLogged.formatted,
              meta: i18n.t('homeDashboard.details.ofGoal', {
                goal: annualGoal.formatted,
              }),
              progress: yearProgress,
              stats: [
                {
                  label: i18n.t('homeDashboard.details.projected'),
                  value: yearProjected.formatted,
                },
                { label: i18n.t('planned'), value: yearPlanned.formatted },
              ],
              description: i18n.t('homeDashboard.details.serviceYearProgress'),
            },
          },
        ]
      : []),
    ...(entryMode === 'hours'
      ? [
          {
            key: 'creditTime' as const,
            icon: ClockIcon,
            value: credit.formatted,
            label: i18n.t('credit'),
            destination: 'Progress' as const,
            detail: {
              title: i18n.t('homeDashboard.editor.cards.creditTime'),
              headline: credit.formatted,
              stats: [
                { label: i18n.t('standard'), value: standard.formatted },
                { label: i18n.t('total'), value: adjustedTotal.formatted },
              ],
              description: i18n.t('homeDashboard.details.creditTime'),
            },
          },
        ]
      : []),
    ...(hasMonthlyGoal
      ? [
          {
            key: 'remainingToGoal' as const,
            icon: GaugeIcon,
            value: remaining.formatted,
            label: i18n.t('remaining'),
            destination: 'Progress' as const,
            color: theme.colors.accent,
            progress: monthGoalProgress,
            progressDisplay: 'ring' as const,
            detail: {
              title: i18n.t('homeDashboard.editor.cards.remainingToGoal'),
              headline: remaining.formatted,
              meta: i18n.t('homeDashboard.details.ofGoal', {
                goal: goal.formatted,
              }),
              progress: monthGoalProgress,
              stats: [
                {
                  label: i18n.t('homeDashboard.details.logged'),
                  value: monthLogged.formatted,
                },
                {
                  label: i18n.t('homeDashboard.details.projected'),
                  value: projected.formatted,
                },
              ],
              description: i18n.t('homeDashboard.details.remainingToGoal'),
            },
          },
        ]
      : []),
    {
      key: 'plannedTotal',
      icon: CalendarRangeIcon,
      value: planned.formatted,
      label: i18n.t('planned'),
      destination: 'Schedule',
      detail: {
        title: i18n.t('homeDashboard.editor.cards.plannedTotal'),
        headline: planned.formatted,
        progress: hasMonthlyGoal
          ? totalPlannedMinutes / goalMinutes
          : undefined,
        stats: [
          {
            label: i18n.t('homeDashboard.details.throughToday'),
            value: pacePlanned.formatted,
          },
          { label: i18n.t('actual'), value: paceActual.formatted },
        ],
        description: i18n.t('homeDashboard.details.plannedTotal'),
      },
    },
  ]

  const cardByKey = new Map(cards.map((card) => [card.key, card]))
  const visible = new Set(visibleCardKeys)
  const orderedCards = orderedCardKeys.filter(
    (key) => visible.has(key) && (key === 'schedulePace' || cardByKey.has(key))
  )

  const open = (destination: DashboardCard['destination']) => {
    if (destination === 'Schedule') {
      navigation.navigate('Schedule', { month, year })
      return
    }
    navigation.navigate('Progress', { month, year })
  }

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          minHeight: 32,
          paddingLeft: 5,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('thisMonth')}
        </Text>
        <IconButton
          icon={PencilIcon}
          size='sm'
          onPress={onEdit}
          accessibilityLabel={i18n.t('edit')}
        />
      </View>

      {orderedCards.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          {orderedCards.map((key) => {
            if (key === 'schedulePace') {
              return (
                <SchedulePaceInsight
                  key={key}
                  month={month}
                  year={year}
                  variant='dashboard'
                  onOpenSchedule={() => open('Schedule')}
                />
              )
            }

            const card = cardByKey.get(key)
            if (!card) return null

            return (
              <DashboardTile
                key={card.key}
                card={card}
                onNavigate={() => open(card.destination)}
              />
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

export default ThisMonthDashboard
