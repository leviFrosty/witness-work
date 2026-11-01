import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import {
  CircleQuestionMark as CircleQuestionMarkIcon,
  Trophy as TrophyIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import type { PopoverControls } from '@/components/ui/Popover'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useToday from '@/hooks/useToday'
import {
  formatDate,
  formatDisplay,
  formatMonthDayCompact,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import { streakHistory, type ServiceStreak } from '@/lib/serviceStreak'
import { logPlannedDayParams } from '@/lib/unloggedDayReminders'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackNavigation } from '@/types/rootStack'
import StreakFlame from '@/features/profile/components/StreakFlame'

const DAY = 'YYYY-MM-DD'

function startedLabel(streak: ServiceStreak, today: Date): string | null {
  if (!streak.since) return null
  const since = moment(streak.since, DAY)
  if (streak.kind === 'months') return formatDisplay(since, 'MMMM YYYY')
  return since.year() === today.getFullYear()
    ? formatMonthDayCompact(since)
    : formatDate(since, { style: 'medium' })
}

function Fact({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: ReactNode
}) {
  const theme = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{ flex: 1, gap: 2 }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon}
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

export default function StreakDetails({
  streak,
  count,
  ending,
  closeThen,
  footer,
}: {
  streak: ServiceStreak

  count: number

  ending: { period: string } | null
  closeThen: PopoverControls['closeThen']
  footer?: ReactNode
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const today = useToday()
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const months = streak.kind === 'months'

  const history = streakHistory(
    streak.kind,
    { serviceReports, dayPlans, recurringPlans },
    today
  )
  const best = Math.max(history.best, count)
  const started = startedLabel(streak, today)
  const unit = i18n.t(
    (months ? 'streak_unitMonths' : 'streak_unitPlans') as TranslationKey,
    { count }
  )
  const period = ending ? moment(ending.period, DAY) : null
  const helper = period
    ? months
      ? i18n.t('streak_endingMonths', { month: period.format('MMMM') })
      : i18n.t('streak_endingPlans', {
          date: formatWeekdayMonthDayCompact(period),
        })
    : null

  const keepIt = () => {
    if (!ending) return
    if (months) {
      navigation.navigate('ServiceHistory', { source: 'streak' })
      return
    }
    navigation.navigate(
      'Add Time',
      logPlannedDayParams(ending.period, {
        dayPlans,
        recurringPlans,
        timeEntries: serviceReports,
      })
    )
  }

  const openFaq = () =>
    navigation.navigate('FAQ', { scrollToCategory: 'streaks' })

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <StreakFlame />
        <View
          accessible
          accessibilityLabel={`${formatNumber(count)} ${unit}`}
          style={{ flex: 1 }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('2xl'),
              fontFamily: theme.fonts.bold,
              color: theme.colors.orange,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatNumber(count)}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {unit}
          </Text>
        </View>
        <PointerTooltip label={i18n.t('streak_howItWorks')}>
          <IconButton
            icon={CircleQuestionMarkIcon}
            size={20}
            frame
            onPress={() => closeThen(openFaq)}
            accessibilityLabel={i18n.t('streak_howItWorks')}
            style={{ alignSelf: 'flex-start' }}
          />
        </PointerTooltip>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {started && <Fact label={i18n.t('streak_started')} value={started} />}
        <Fact
          label={i18n.t('streak_best')}
          value={formatNumber(best)}
          icon={
            count >= best ? (
              <LucideIcon
                icon={TrophyIcon}
                size={14}
                color={theme.colors.orange}
              />
            ) : undefined
          }
        />
      </View>

      {helper && (
        <View
          style={{
            gap: 10,
            paddingTop: 12,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {helper}
          </Text>
          <Button
            onPress={() => closeThen(keepIt)}
            style={{
              alignSelf: 'flex-start',
              justifyContent: 'center',
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: 16,
              borderRadius: theme.numbers.borderRadiusSm,
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textInverse,
              }}
            >
              {i18n.t(months ? 'streak_recordMonth' : 'addTime')}
            </Text>
          </Button>
        </View>
      )}

      {footer}
    </>
  )
}
