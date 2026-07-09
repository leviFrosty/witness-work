import { useNavigation } from '@react-navigation/native'
import {
  CalendarClock as CalendarClockIcon,
  CalendarRange as CalendarRangeIcon,
  ChartLine as ChartLineIcon,
  ChevronRight as ChevronRightIcon,
  CircleCheck as CircleCheckIcon,
  Clock3 as ClockIcon,
  Gauge as GaugeIcon,
  Pencil as PencilIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { View } from 'react-native'

import TiltableCard from '@/components/TiltableCard'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import usePublisher from '@/hooks/usePublisher'
import i18n, { type TranslationKey } from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { calculateMonthlyPlannedMinutesOptimized } from '@/lib/recurrence'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import {
  getScheduleStatusForMonth,
  type ScheduleStatusState,
} from '@/lib/scheduleStatus'
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

const STATUS_TITLE_KEYS: Record<ScheduleStatusState, TranslationKey> = {
  ahead: 'scheduleStatus.ahead',
  behind: 'scheduleStatus.behind',
  onTrack: 'scheduleStatus.onTrack',
  noPlan: 'scheduleStatus.noPlan',
  notStarted: 'scheduleStatus.upcoming',
}

type DashboardCard = {
  key: ThisMonthDashboardCardKey
  icon: AppIcon
  value: string
  label: string
  color?: string
  destination: 'Progress' | 'Schedule'
  progress?: number
}

const DashboardTile = ({
  card,
  onPress,
}: {
  card: DashboardCard
  onPress: () => void
}) => {
  const theme = useTheme()

  return (
    <View
      accessible
      accessibilityRole='button'
      accessibilityLabel={`${card.label}. ${card.value}`}
      accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
      onAccessibilityTap={onPress}
      style={{ width: '48.5%' }}
    >
      <TiltableCard onTap={onPress} maxTilt={5}>
        <Card
          style={{
            minHeight: 112,
            padding: 12,
            gap: 10,
            justifyContent: 'space-between',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
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
            <LucideIcon
              icon={ChevronRightIcon}
              color={theme.colors.textAlt}
              size={12}
            />
          </View>

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
            {card.progress !== undefined ? (
              <SimpleProgressBar
                percentage={card.progress}
                color={card.color ?? theme.colors.accent}
                height={4}
                animated={false}
              />
            ) : null}
          </View>
        </Card>
      </TiltableCard>
    </View>
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
  const scheduleStatus = getScheduleStatusForMonth({
    month,
    year,
    serviceReports,
    dayPlans,
    recurringPlans,
    publisher,
    creditLimit: {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    },
  })
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

  const paceDifference = useFormattedMinutes(
    Math.abs(scheduleStatus.differenceMinutes)
  )
  const projected = useFormattedMinutes(monthProjection.projectedMinutes)
  const yearLogged = useFormattedMinutes(yearProjection.loggedMinutes)
  const credit = useFormattedMinutes(monthAdjusted.credit)
  const remaining = useFormattedMinutes(
    Math.max(0, goalMinutes - monthProjection.loggedMinutes)
  )
  const planned = useFormattedMinutes(totalPlannedMinutes)

  const hasMonthlyGoal = entryMode === 'hours' && goalMinutes > 0
  const paceColor =
    scheduleStatus.state === 'behind'
      ? theme.colors.warn
      : scheduleStatus.state === 'ahead' || scheduleStatus.state === 'onTrack'
        ? theme.colors.accent
        : theme.colors.textAlt
  const paceIcon: AppIcon =
    scheduleStatus.state === 'ahead'
      ? TrendingUpIcon
      : scheduleStatus.state === 'behind'
        ? TrendingDownIcon
        : scheduleStatus.state === 'onTrack'
          ? CircleCheckIcon
          : CalendarClockIcon
  const paceValue =
    scheduleStatus.state === 'ahead'
      ? `+${paceDifference.formatted}`
      : scheduleStatus.state === 'behind'
        ? `-${paceDifference.formatted}`
        : i18n.t(STATUS_TITLE_KEYS[scheduleStatus.state])

  const cards: DashboardCard[] = [
    {
      key: 'schedulePace',
      icon: paceIcon,
      value: paceValue,
      label: i18n.t('scheduleInsights.schedulePace'),
      color: paceColor,
      destination: 'Schedule',
    },
    ...(hasMonthlyGoal
      ? [
          {
            key: 'projectedMonth' as const,
            icon: ChartLineIcon,
            value: projected.formatted,
            label: i18n.t('projectedTotal.headerMonth'),
            destination: 'Progress' as const,
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
            progress: yearProjection.loggedMinutes / (annualGoalHours * 60),
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
          },
        ]
      : []),
    {
      key: 'plannedTotal',
      icon: CalendarRangeIcon,
      value: planned.formatted,
      label: i18n.t('planned'),
      destination: 'Schedule',
    },
  ]

  const cardByKey = new Map(cards.map((card) => [card.key, card]))
  const visible = new Set(visibleCardKeys)
  const orderedCards = orderedCardKeys.flatMap((key) => {
    const card = cardByKey.get(key)
    return card && visible.has(key) ? [card] : []
  })

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
          {orderedCards.map((card) => (
            <DashboardTile
              key={card.key}
              card={card}
              onPress={() => open(card.destination)}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

export default ThisMonthDashboard
