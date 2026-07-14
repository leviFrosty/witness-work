import {
  CalendarClock as CalendarClockIcon,
  ChevronRight as ChevronRightIcon,
  CircleCheck as CircleCheckIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
  X as XIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import CircularProgress from '@/components/ui/CircularProgress'
import ExpandingCardOverlay, {
  type ExpandingCardOrigin,
} from '@/components/ui/ExpandingCardOverlay'
import IconButton from '@/components/ui/IconButton'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import TiltableCard from '@/components/TiltableCard'
import useTheme from '@/contexts/theme'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import i18n, { type TranslationKey } from '@/lib/locales'
import { calculateMonthlyPlannedMinutesOptimized } from '@/lib/recurrence'
import {
  getScheduleStatusForMonth,
  type ScheduleStatusState,
} from '@/lib/scheduleStatus'
import { useFormattedMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'

type InsightKind = 'pace' | 'goal'

const STATUS_TITLE_KEYS: Record<ScheduleStatusState, TranslationKey> = {
  ahead: 'scheduleStatus.ahead',
  behind: 'scheduleStatus.behind',
  onTrack: 'scheduleStatus.onTrack',
  noPlan: 'scheduleStatus.noPlan',
  notStarted: 'scheduleStatus.upcoming',
}

const InsightStat = ({ label, value }: { label: string; value: string }) => {
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

const ScheduleInsightOverlay = ({
  origin,
  open,
  onClose,
  kind,
  statusTitle,
  statusMeta,
  statusIcon,
  statusColor,
  statusProgress,
  actual,
  pacePlanned,
  plannedPercent,
  monthPlanned,
  goal,
  leftToPlan,
  goalProgress,
  isCurrentMonth,
  onEditGoal,
}: {
  origin: ExpandingCardOrigin | null
  open: boolean
  onClose: () => void
  kind: InsightKind
  statusTitle: string
  statusMeta: string
  statusIcon: AppIcon
  statusColor: string
  statusProgress: number
  actual: string
  pacePlanned: string
  plannedPercent: number
  monthPlanned: string
  goal: string
  leftToPlan: string
  goalProgress: number
  isCurrentMonth: boolean
  onEditGoal?: () => void
}) => {
  const theme = useTheme()

  const isPace = kind === 'pace'
  const detailColor = isPace ? statusColor : theme.colors.accent
  const detailTitle = isPace
    ? i18n.t('scheduleInsights.schedulePace')
    : i18n.t('scheduleInsights.goalPlanned')

  return (
    <ExpandingCardOverlay origin={origin} open={open} onClose={onClose}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {isPace ? (
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
              <LucideIcon icon={statusIcon} color={detailColor} size={20} />
            </View>
          ) : (
            <CircularProgress
              progress={goalProgress}
              size={32}
              strokeWidth={4}
              color={theme.colors.textAlt}
              trackColor={theme.colors.border}
            />
          )}
          <Text
            accessibilityRole='header'
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {detailTitle}
          </Text>
        </View>
        <IconButton icon={XIcon} size='lg' onPress={onClose} />
      </View>

      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text
            style={{
              color: detailColor,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('2xl'),
            }}
          >
            {isPace
              ? statusTitle
              : i18n.t('scheduleInsights.percentPlanned', {
                  percent: plannedPercent,
                })}
          </Text>
          {isPace ? (
            <Text
              style={{
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {statusMeta}
            </Text>
          ) : null}
        </View>
        {!isPace ? (
          <Button
            noTransform
            accessibilityRole={onEditGoal ? 'button' : undefined}
            onPress={
              onEditGoal
                ? () => {
                    onClose()
                    setTimeout(onEditGoal, 150)
                  }
                : undefined
            }
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {i18n.t('scheduleInsights.monthlyGoal')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {goal}
                </Text>
                {onEditGoal ? (
                  <LucideIcon
                    icon={ChevronRightIcon}
                    color={theme.colors.textAlt}
                    size={12}
                  />
                ) : null}
              </View>
            </View>
          </Button>
        ) : null}
        <SimpleProgressBar
          percentage={isPace ? statusProgress : goalProgress}
          color={detailColor}
          height={10}
          animated={false}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {isPace ? (
          <>
            <InsightStat label={i18n.t('actual')} value={actual} />
            <InsightStat label={i18n.t('planned')} value={pacePlanned} />
          </>
        ) : (
          <>
            <InsightStat label={i18n.t('planned')} value={monthPlanned} />
            <InsightStat
              label={i18n.t('scheduleInsights.leftToPlan')}
              value={leftToPlan}
            />
          </>
        )}
      </View>

      {isPace ? (
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            lineHeight: 19,
          }}
        >
          {i18n.t(
            isCurrentMonth
              ? 'scheduleInsights.paceDescriptionCurrent'
              : 'scheduleInsights.paceDescriptionMonth'
          )}
        </Text>
      ) : null}
    </ExpandingCardOverlay>
  )
}

const ScheduleInsights = ({
  month,
  year,
  onEditGoal,
}: {
  month: number
  year: number
  onEditGoal?: () => void
}) => {
  const theme = useTheme()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const { role, overrideCreditLimit, customCreditLimitHours } = usePreferences()
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const paceRef = useRef<View>(null)
  const goalRef = useRef<View>(null)
  const [detailKind, setDetailKind] = useState<InsightKind>('pace')
  const [detailOpen, setDetailOpen] = useState(false)
  const [origin, setOrigin] = useState<ExpandingCardOrigin | null>(null)

  const status = getScheduleStatusForMonth({
    month,
    year,
    serviceReports,
    dayPlans,
    recurringPlans,
    publisher: role,
    creditLimit: {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    },
  })
  const monthPlannedMinutes = calculateMonthlyPlannedMinutesOptimized(
    month,
    year,
    dayPlans,
    recurringPlans
  )
  const goalMinutes = Math.round(effectiveGoalHours * 60)
  const plannedPercent =
    goalMinutes > 0 ? Math.round((monthPlannedMinutes / goalMinutes) * 100) : 0
  const goalProgress =
    goalMinutes > 0 ? Math.max(0, monthPlannedMinutes / goalMinutes) : 0
  const leftToPlanMinutes = Math.max(0, goalMinutes - monthPlannedMinutes)
  const statusProgress =
    status.plannedMinutes > 0
      ? Math.max(0, status.actualMinutes / status.plannedMinutes)
      : status.actualMinutes > 0
        ? 1
        : 0

  const actualDisplay = useFormattedMinutes(status.actualMinutes)
  const pacePlannedDisplay = useFormattedMinutes(status.plannedMinutes)
  const differenceDisplay = useFormattedMinutes(
    Math.abs(status.differenceMinutes)
  )
  const monthPlannedDisplay = useFormattedMinutes(monthPlannedMinutes)
  const goalDisplay = useFormattedMinutes(goalMinutes)
  const leftToPlanDisplay = useFormattedMinutes(leftToPlanMinutes)
  const isCurrentMonth = moment({ year, month }).isSame(moment(), 'month')

  const statusColor = (() => {
    switch (status.state) {
      case 'ahead':
      case 'onTrack':
        return theme.colors.accent
      case 'behind':
        return theme.colors.warn
      default:
        return theme.colors.textAlt
    }
  })()
  const statusIcon: AppIcon = (() => {
    switch (status.state) {
      case 'ahead':
        return TrendingUpIcon
      case 'behind':
        return TrendingDownIcon
      case 'onTrack':
        return CircleCheckIcon
      default:
        return CalendarClockIcon
    }
  })()
  const statusTitle = i18n.t(STATUS_TITLE_KEYS[status.state])
  const statusMeta = (() => {
    switch (status.state) {
      case 'ahead':
        return `+${differenceDisplay.formatted}`
      case 'behind':
        return `-${differenceDisplay.formatted}`
      case 'onTrack':
        return i18n.t('scheduleStatus.matched')
      case 'noPlan':
        return i18n.t('scheduleStatus.noPlannedTime')
      case 'notStarted':
        return i18n.t('scheduleStatus.notStarted')
    }
  })()

  const openDetail = (kind: InsightKind) => {
    const ref = kind === 'pace' ? paceRef : goalRef
    ref.current?.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y, width, height })
      setDetailKind(kind)
      setDetailOpen(true)
    })
  }

  const cards = [
    {
      kind: 'pace' as const,
      ref: paceRef,
      icon: statusIcon,
      color: statusColor,
      tint: theme.colors.backgroundLighter,
      value: statusTitle,
      label: statusMeta,
    },
    {
      kind: 'goal' as const,
      ref: goalRef,
      color: theme.colors.text,
      tint: theme.colors.backgroundLighter,
      value: i18n.t('scheduleInsights.percentPlanned', {
        percent: plannedPercent,
      }),
      label: i18n.t('scheduleInsights.ofGoal', {
        goal: goalDisplay.formatted,
      }),
    },
  ]

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {cards.map((card) => (
          <View
            key={card.kind}
            ref={card.ref}
            collapsable={false}
            accessible
            accessibilityRole='button'
            accessibilityLabel={`${card.value}. ${card.label}`}
            accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
            onAccessibilityTap={() => openDetail(card.kind)}
            style={{ flex: 1 }}
          >
            <TiltableCard onTap={() => openDetail(card.kind)} maxTilt={5}>
              <Card
                style={{
                  minHeight: 102,
                  padding: 12,
                  gap: 10,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  {card.kind === 'goal' ? (
                    <CircularProgress
                      progress={goalProgress}
                      size={24}
                      strokeWidth={4}
                      color={theme.colors.textAlt}
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
                        backgroundColor: card.tint,
                      }}
                    >
                      <LucideIcon
                        icon={card.icon}
                        color={card.color}
                        size={16}
                      />
                    </View>
                  )}
                  <LucideIcon
                    icon={ChevronRightIcon}
                    color={theme.colors.textAlt}
                    size={12}
                  />
                </View>
                <View style={{ gap: 1 }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      color: card.color,
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
                </View>
              </Card>
            </TiltableCard>
          </View>
        ))}
      </View>

      <ScheduleInsightOverlay
        origin={origin}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        kind={detailKind}
        statusTitle={statusTitle}
        statusMeta={statusMeta}
        statusIcon={statusIcon}
        statusColor={statusColor}
        statusProgress={statusProgress}
        actual={actualDisplay.formatted}
        pacePlanned={pacePlannedDisplay.formatted}
        plannedPercent={plannedPercent}
        monthPlanned={monthPlannedDisplay.formatted}
        goal={goalDisplay.formatted}
        leftToPlan={leftToPlanDisplay.formatted}
        goalProgress={goalProgress}
        isCurrentMonth={isCurrentMonth}
        onEditGoal={onEditGoal}
      />
    </>
  )
}

export default ScheduleInsights
