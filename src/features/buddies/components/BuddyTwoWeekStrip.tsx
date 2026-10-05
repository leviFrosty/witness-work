import { View } from 'react-native'
import moment from 'moment'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import usePlanSameTime from '@/features/buddies/hooks/usePlanSameTime'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { buildBuddyCardDays } from '@/features/buddies/lib/card'
import type { BuddyCardDay } from '@/features/buddies/lib/schemas'
import type { ReceivedCard } from '@/features/buddies/lib/state'

const DAYS = 14
const DOT = 6

function Dot({ color }: { color?: string }) {
  return (
    <View
      style={{
        width: DOT,
        height: DOT,
        borderRadius: DOT / 2,
        backgroundColor: color ?? 'transparent',
      }}
    />
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const theme = useTheme()
  return (
    <XView style={{ gap: 6 }}>
      <Dot color={color} />
      <Text
        style={{ color: theme.colors.textAlt, fontSize: theme.fontSize('sm') }}
      >
        {label}
      </Text>
    </XView>
  )
}

/**
 * The buddy's days and the User's own for the next two weeks, side by side. Tap
 * one of the buddy's days to plan the same time.
 */
export default function BuddyTwoWeekStrip({
  buddyName,
  colorIndex,
  card,
}: {
  buddyName: string
  colorIndex: number
  card?: ReceivedCard
}) {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const planSameTime = usePlanSameTime('buddy_detail')

  const start = moment().startOf('day')
  const theirColor = buddyColor(theme, colorIndex)
  const theirs = new Map((card?.days ?? []).map((day) => [day.d, day.p]))
  const mine = new Set(
    buildBuddyCardDays(dayPlans, recurringPlans, start.toDate(), DAYS).map(
      (day) => day.d
    )
  )
  const days = Array.from({ length: DAYS }, (_, offset) =>
    start.clone().add(offset, 'days')
  )
  const anyTheirs = days.some((day) => theirs.has(day.format('YYYY-MM-DD')))

  const planLabel = (plan: BuddyCardDay['p'][number]) => {
    const duration = formatMinutes(plan.m, timeDisplayFormat).formatted
    return plan.s === undefined
      ? i18n.t('buddies_dayPlanAnyTime', { duration })
      : i18n.t('buddies_dayPlanAtTime', {
          time: formatStartTime(plan.s),
          duration,
        })
  }

  const cell = (day: moment.Moment) => {
    const key = day.format('YYYY-MM-DD')
    const plans = theirs.get(key)
    const isToday = day.isSame(start, 'day')
    const content = (
      <View style={{ alignItems: 'center', gap: 4, paddingVertical: 6 }}>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {day.format('dd')}
        </Text>
        <Text
          style={{
            fontFamily: isToday ? theme.fonts.bold : theme.fonts.regular,
            color: isToday ? theme.colors.accent : theme.colors.text,
          }}
        >
          {day.format('D')}
        </Text>
        <XView style={{ gap: 3 }}>
          <Dot color={plans ? theirColor : undefined} />
          <Dot color={mine.has(key) ? theme.colors.accent : undefined} />
        </XView>
      </View>
    )
    const label = [
      day.format('dddd, LL'),
      plans
        ? i18n.t('buddies_stripTheirPlans', {
            name: buddyName,
            plans: plans.map(planLabel).join(', '),
          })
        : undefined,
      mine.has(key) ? i18n.t('buddies_stripYouPlan') : undefined,
      !plans && !mine.has(key) ? i18n.t('buddies_stripNothing') : undefined,
    ]
      .filter(Boolean)
      .join('. ')

    return (
      <View key={key} style={{ flex: 1 }}>
        {plans ? (
          <PullDownMenu
            accessibilityLabel={label}
            actions={plans.map((plan, index) => ({
              id: `plan_same_time_${index}`,
              title: i18n.t('buddies_planSameTimeAs', {
                plan: planLabel(plan),
              }),
              systemImage: 'calendar.badge.plus',
              onPress: () => planSameTime(key, plan),
            }))}
          >
            {content}
          </PullDownMenu>
        ) : (
          <View accessible accessibilityLabel={label}>
            {content}
          </View>
        )}
      </View>
    )
  }

  return (
    <BuddiesSection
      title={i18n.t('buddies_nextTwoWeeks')}
      footer={
        !anyTheirs
          ? i18n.t('buddies_noPlansTwoWeeks', { name: buddyName })
          : card
            ? i18n.t('buddies_plansUpdated', {
                time: moment(card.updatedAt).fromNow(),
              })
            : undefined
      }
    >
      <View style={{ gap: 4, paddingVertical: 8, paddingHorizontal: 8 }}>
        <XView>{days.slice(0, 7).map(cell)}</XView>
        <XView>{days.slice(7).map(cell)}</XView>
        <XView style={{ gap: 16, justifyContent: 'center', paddingTop: 4 }}>
          <LegendItem color={theirColor} label={buddyName} />
          <LegendItem
            color={theme.colors.accent}
            label={i18n.t('buddies_you')}
          />
        </XView>
      </View>
    </BuddiesSection>
  )
}
