import { useEffect } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Bell as BellIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import useConversations from '@/stores/conversationStore'
import { useServiceReport } from '@/stores/serviceReport'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyNotificationRow from '@/features/buddies/components/BuddyNotificationRow'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { followUpShareKey, planShareKey } from '@/features/buddies/lib/shares'
import type { BuddyNotification } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Entries that still need an answer survive "Clear All". */
function needsAnswer(
  entry: BuddyNotification,
  state: ReturnType<typeof useBuddies.getState>
) {
  if (entry.kind === 'claim')
    return state.incomingClaims.some((c) => c.inviteId === entry.inviteId)
  if (entry.kind === 'shareInvite' || entry.kind === 'shareUpdate')
    return state.incomingShares[entry.shareKey ?? '']?.status === 'pending'
  return false
}

/**
 * The Home bell's popover: buddy invitations, changes, cancellations, replies,
 * and new pairings, newest first. Syncs when it opens; everything is marked
 * read when it closes.
 */
export default function BuddyNotificationsList({
  closeThen,
}: {
  /** Closes the popover, then runs the action (e.g. navigating). */
  closeThen: (action: () => void) => void
}) {
  const theme = useTheme()
  const { height } = useWindowDimensions()
  const navigation = useNavigation<RootStackNavigation>()
  const notifications = useBuddies((state) => state.notifications)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const visits = useConversations((state) => state.conversations)

  useEffect(() => {
    void buddiesEngine
      .sync()
      .catch((error) => logger.warn('[buddies] notifications sync', error))
    return () => buddiesEngine.markNotificationsRead()
  }, [])

  /** A reply opens the Plan or Contact it's about. */
  const openReply = (shareId: string) => {
    const plan = dayPlans.find(
      (candidate) =>
        candidate.buddies?.length &&
        buddiesEngine.shareIdForKey(planShareKey(candidate.id)) === shareId
    )
    if (plan) {
      closeThen(() =>
        navigation.navigate('PlanDay', { existingDayPlanId: plan.id })
      )
      return
    }
    const visit = visits.find(
      (candidate) =>
        candidate.followUp?.buddies?.length &&
        buddiesEngine.shareIdForKey(followUpShareKey(candidate.id)) === shareId
    )
    if (visit)
      closeThen(() =>
        navigation.navigate('Contact Details', { id: visit.contact.id })
      )
  }

  /** A new pairing opens that buddy, while they're still a buddy. */
  const openBuddy = (inboxId: string) => {
    if (useBuddies.getState().buddies.some((b) => b.inboxId === inboxId))
      closeThen(() => navigation.navigate('Buddy', { inboxId }))
  }

  const clearAll = () => {
    const state = useBuddies.getState()
    for (const entry of state.notifications)
      if (!needsAnswer(entry, state))
        buddiesEngine.dismissNotification(entry.id)
  }

  if (notifications.length === 0) {
    return (
      <Empty
        icon={
          <LucideIcon icon={BellIcon} size={32} color={theme.colors.text} />
        }
        title={i18n.t('notifications_emptyTitle')}
        description={i18n.t('notifications_emptyBody')}
      />
    )
  }

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('notifications_title')}
        </Text>
        <Button onPress={clearAll}>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('notifications_clearAll')}
          </Text>
        </Button>
      </View>
      <ScrollView style={{ maxHeight: height * 0.6 }}>
        {notifications.map((entry, index) => (
          <BuddyNotificationRow
            key={entry.id}
            entry={entry}
            last={index === notifications.length - 1}
            onPress={
              entry.kind === 'shareReply' && entry.shareKey
                ? () => openReply(entry.shareKey!)
                : entry.kind === 'paired' && entry.from
                  ? () => openBuddy(entry.from!)
                  : undefined
            }
          />
        ))}
      </ScrollView>
    </View>
  )
}
