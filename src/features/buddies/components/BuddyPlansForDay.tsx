import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import AskToJoinButton from '@/features/buddies/components/AskToJoinButton'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import useAskToJoin from '@/features/buddies/hooks/useAskToJoin'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import usePlanSameTime from '@/features/buddies/hooks/usePlanSameTime'
import useBuddyCalendarMarkers from '@/features/buddies/hooks/useBuddyCalendarMarkers'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Faded, read-only buddy Plans for one day — they never mix with the User's
 * own. Each can be asked to join; long-press a row to view the buddy or plan
 * the same time.
 */
export default function BuddyPlansForDay({
  date,
  onNavigate,
}: {
  date: Date
  /**
   * Runs a navigation from a row's menu, e.g. once the sheet the rows sit in
   * has closed. Without it the rows have no menu.
   */
  onNavigate?: (go: () => void) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const planSameTime = usePlanSameTime('buddy_plans_for_day')
  const askToJoin = useAskToJoin('buddy_plans_for_day')
  const enabled = useBuddiesEnabled()
  const { timeDisplayFormat, dataProtectionMode } = usePreferences()
  const buddies = useBuddies((state) => state.buddies)
  const cards = useBuddies((state) => state.cards)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const key = moment(date).format('YYYY-MM-DD')
  // Buddies the User goes out with show on the User's own Plans instead.
  const withBuddies = useBuddyCalendarMarkers()[key]?.withBuddies ?? []
  if (!enabled) return null

  const rows = buddies
    .filter(
      (buddy) =>
        buddy.status === 'active' &&
        buddy.showOnCalendar &&
        !withBuddies.some((other) => other.inboxId === buddy.inboxId)
    )
    .flatMap((buddy) =>
      (cards[buddy.inboxId]?.days.find((day) => day.d === key)?.p ?? []).map(
        (plan, index) => ({ buddy, plan, key: `${buddy.inboxId}-${index}` })
      )
    )
  // Follow-ups the User said they'd join; accepted Plans are real Plans.
  const followUps = Object.values(incomingShares)
    .filter(
      (share) =>
        share.type === 'followUp' &&
        share.status === 'going' &&
        share.expiresAt > Date.now() &&
        share.details.d === key
    )
    .flatMap((share) => {
      const buddy = buddies.find((b) => b.inboxId === share.from)
      return buddy ? [{ buddy, share }] : []
    })
  if (rows.length === 0 && followUps.length === 0) return null

  const past = key < moment().format('YYYY-MM-DD')

  // Also reachable from the buddy's detail screen and its upcoming plans.
  const viewBuddy = (inboxId: string) =>
    onNavigate && {
      id: 'view_buddy',
      title: i18n.t('buddies_viewBuddy'),
      systemImage: 'person.crop.circle' as const,
      onPress: () =>
        onNavigate(() => navigation.navigate('Buddy', { inboxId })),
    }

  return (
    <View style={{ gap: 8, paddingTop: 10 }}>
      <Text
        style={{
          opacity: 0.7,
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          letterSpacing: 0.5,
        }}
      >
        {i18n.t('buddies_dayTitle')}
      </Text>
      {rows.map(({ buddy, plan, key: rowKey }) => {
        const duration = formatMinutes(plan.m, timeDisplayFormat).formatted
        const label =
          plan.s === undefined
            ? i18n.t('buddies_dayPlanAnyTime', { duration })
            : i18n.t('buddies_dayPlanAtTime', {
                time: formatStartTime(plan.s),
                duration,
              })
        return (
          <XView key={rowKey} style={{ gap: 10 }}>
            <ContextMenu
              style={{ flex: 1 }}
              actions={[
                viewBuddy(buddy.inboxId),
                !past && askToJoin.menuAction(buddy, key, plan),
                onNavigate &&
                  !past && {
                    id: 'plan_same_time',
                    title: i18n.t('buddies_planSameTime'),
                    systemImage: 'calendar.badge.plus',
                    onPress: () => onNavigate(() => planSameTime(key, plan)),
                  },
              ]}
            >
              <XView style={{ gap: 10, opacity: 0.7 }}>
                <BuddyAvatar
                  avatar={buddy.avatar}
                  name={buddy.name}
                  colorIndex={buddy.colorIndex}
                  size={22}
                />
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {buddy.name}
                </Text>
                <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
                  {label}
                </Text>
              </XView>
            </ContextMenu>
            {past ? null : (
              <AskToJoinButton
                buddy={buddy}
                d={key}
                plan={plan}
                label={`${moment(date).format('ddd, MMM D')}, ${label}`}
                askToJoin={askToJoin}
              />
            )}
          </XView>
        )
      })}
      {followUps.map(({ buddy, share }) => (
        <ContextMenu
          key={`${share.from}-${share.shareId}`}
          actions={[viewBuddy(buddy.inboxId)]}
        >
          <XView style={{ gap: 10, opacity: 0.7 }}>
            <BuddyAvatar
              avatar={buddy.avatar}
              name={buddy.name}
              colorIndex={buddy.colorIndex}
              size={22}
            />
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {buddy.name}
            </Text>
            <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
              {[
                // The householder's name stays hidden in data protection mode.
                share.details.firstName && !dataProtectionMode
                  ? i18n.t('buddies_followUpWith', {
                      name: share.details.firstName,
                    })
                  : i18n.t('buddies_followUp'),
                share.details.s === undefined
                  ? undefined
                  : formatStartTime(share.details.s),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </XView>
        </ContextMenu>
      ))}
    </View>
  )
}
