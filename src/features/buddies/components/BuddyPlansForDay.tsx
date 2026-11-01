import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatStartTime, formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import AskToJoinButton from '@/features/buddies/components/AskToJoinButton'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import useAskToJoin from '@/features/buddies/hooks/useAskToJoin'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import usePlanSameTime from '@/features/buddies/hooks/usePlanSameTime'
import useBuddyCalendarMarkers from '@/features/buddies/hooks/useBuddyCalendarMarkers'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { cardPlanLabel } from '@/features/buddies/lib/cardPlanLabel'
import { buddySettings } from '@/features/buddies/lib/state'
import { tracking } from '@/lib/tracking'

export default function BuddyPlansForDay({
  date,
  onNavigate,
}: {
  date: Date

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
  const sharing = useBuddies((state) => state.sharing)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const key = moment(date).format('YYYY-MM-DD')

  const withBuddies = useBuddyCalendarMarkers()[key]?.withBuddies ?? []
  if (!enabled) return null

  const rows = buddies
    .filter(
      (buddy) =>
        buddy.status === 'active' &&
        buddySettings(sharing, buddy).settings.showOnCalendar &&
        !withBuddies.some((other) => other.inboxId === buddy.inboxId)
    )
    .flatMap((buddy) =>
      (cards[buddy.inboxId]?.days.find((day) => day.d === key)?.p ?? []).map(
        (plan, index) => ({ buddy, plan, key: `${buddy.inboxId}-${index}` })
      )
    )

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
          letterSpacing: tracking(0.5),
        }}
      >
        {i18n.t('buddies_dayTitle')}
      </Text>
      {rows.map(({ buddy, plan, key: rowKey }) => {
        const label = cardPlanLabel(plan, timeDisplayFormat)
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
                  name={buddyDisplayName(buddy)}
                  color={buddy}
                  size={22}
                />
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {buddyDisplayName(buddy)}
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
                label={`${formatWeekdayMonthDayCompact(moment(date))}, ${label}`}
                askToJoin={askToJoin}
              />
            )}
          </XView>
        )
      })}
      {followUps.map(({ buddy, share }) => {
        const openFollowUp =
          onNavigate &&
          (() =>
            onNavigate(() =>
              navigation.navigate('Follow-Up Invitation', {
                from: share.from,
                shareId: share.shareId,
              })
            ))
        return (
          <ContextMenu
            key={`${share.from}-${share.shareId}`}
            onPress={openFollowUp || undefined}
            actions={[
              openFollowUp && {
                id: 'open',
                title: i18n.t('open'),
                systemImage: 'arrow.up.forward.app',
                onPress: openFollowUp,
              },
              viewBuddy(buddy.inboxId),
            ]}
          >
            <XView style={{ gap: 10, opacity: 0.7 }}>
              <BuddyAvatar
                avatar={buddy.avatar}
                name={buddyDisplayName(buddy)}
                color={buddy}
                size={22}
              />
              <Text style={{ fontFamily: theme.fonts.semiBold }}>
                {buddyDisplayName(buddy)}
              </Text>
              <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
                {[
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
        )
      })}
    </View>
  )
}
