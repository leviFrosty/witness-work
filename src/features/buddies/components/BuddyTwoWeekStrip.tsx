import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import Text from '@/components/ui/MyText'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'
import PullDownMenu from '@/components/ui/PullDownMenu'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import useServiceReport from '@/stores/serviceReport'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import useAskToJoin from '@/features/buddies/hooks/useAskToJoin'
import usePlanSameTime from '@/features/buddies/hooks/usePlanSameTime'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { buildBuddyCardDays } from '@/features/buddies/lib/card'
import type { BuddyCardDay } from '@/features/buddies/lib/schemas'
import type { Buddy, ReceivedCard } from '@/features/buddies/lib/state'

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
 * any day to invite the buddy or plan it; on one of the buddy's days, also to
 * plan the same time or ask to join.
 */
export default function BuddyTwoWeekStrip({
  buddy,
  card,
}: {
  buddy: Buddy
  card?: ReceivedCard
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { timeDisplayFormat } = usePreferences()
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const planSameTime = usePlanSameTime('buddy_detail')
  const askToJoin = useAskToJoin('buddy_detail')
  const buddyName = buddyDisplayName(buddy)

  const start = moment().startOf('day')
  const theirColor = buddyColor(theme, buddy)
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
      <View style={{ alignItems: 'center', gap: 4, paddingVertical: 12 }}>
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

    const date = day.clone().hour(12).toISOString()

    return (
      <PullDownMenu
        key={key}
        style={{ flex: 1 }}
        // Neighbouring days would steal each other's edges.
        hitSlop={0}
        accessibilityLabel={label}
        actions={[
          ...(plans ?? []).map((plan, index): ContextMenuEntries[number] => [
            {
              id: `plan_same_time_${index}`,
              title: i18n.t('buddies_planSameTimeAs', {
                plan: planLabel(plan),
              }),
              systemImage: 'calendar.badge.plus',
              onPress: () => planSameTime(key, plan),
            },
            askToJoin.menuAction(buddy, key, plan),
          ]),
          [
            {
              id: 'invite_to_plan',
              title: i18n.t('buddies_inviteNameToPlan', { name: buddyName }),
              systemImage: 'person.2.badge.plus',
              onPress: () => {
                analytics.capture('buddy_plan_invite_opened', {
                  source: 'buddy_detail_day',
                })
                navigation.navigate('PlanDay', {
                  date,
                  prefill: { buddies: [buddy.inboxId] },
                })
              },
            },
            {
              id: 'plan_day',
              title: i18n.t('planThisDay'),
              systemImage: 'calendar',
              onPress: () => navigation.navigate('PlanDay', { date }),
            },
          ],
        ]}
      >
        {content}
      </PullDownMenu>
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
      <View style={{ paddingVertical: 4, paddingHorizontal: 4 }}>
        <XView>{days.slice(0, 7).map(cell)}</XView>
        <XView>{days.slice(7).map(cell)}</XView>
        <XView
          style={{
            gap: 16,
            justifyContent: 'center',
            paddingTop: 4,
            paddingBottom: 8,
          }}
        >
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
