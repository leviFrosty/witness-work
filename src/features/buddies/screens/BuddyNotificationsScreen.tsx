import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
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
 * The Home bell's queue: buddy invitations, changes, cancellations, replies,
 * and new pairings, newest first. Everything is marked read on leaving.
 */
export default function BuddyNotificationsScreen() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const notifications = useBuddies((state) => state.notifications)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const visits = useConversations((state) => state.conversations)
  const [refreshing, setRefreshing] = useState(false)

  // Not a performance memo: useFocusEffect re-runs (and marks everything read)
  // whenever this callback's identity changes, so it must stay stable.
  useFocusEffect(
    useCallback(() => {
      void buddiesEngine.sync().catch(() => {})
      return () => buddiesEngine.markNotificationsRead()
    }, [])
  )

  const refresh = async () => {
    setRefreshing(true)
    await buddiesEngine.sync().catch(() => {})
    setRefreshing(false)
  }

  /** A reply opens the Plan or Contact it's about. */
  const openReply = (shareId: string) => {
    const plan = dayPlans.find(
      (candidate) =>
        candidate.buddies?.length &&
        buddiesEngine.shareIdForKey(planShareKey(candidate.id)) === shareId
    )
    if (plan) {
      navigation.navigate('PlanDay', { existingDayPlanId: plan.id })
      return
    }
    const visit = visits.find(
      (candidate) =>
        candidate.followUp?.buddies?.length &&
        buddiesEngine.shareIdForKey(followUpShareKey(candidate.id)) === shareId
    )
    if (visit) navigation.navigate('Contact Details', { id: visit.contact.id })
  }

  const clearAll = () => {
    const state = useBuddies.getState()
    for (const entry of state.notifications)
      if (!needsAnswer(entry, state))
        buddiesEngine.dismissNotification(entry.id)
  }

  return (
    <Wrapper insets='bottom'>
      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 15, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {notifications.length === 0 ? (
          <View style={{ paddingVertical: 40, paddingHorizontal: 20 }}>
            <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
              {i18n.t('buddies_notificationsEmpty')}
            </Text>
          </View>
        ) : (
          <>
            {notifications.map((entry) => (
              <BuddyNotificationRow
                key={entry.id}
                entry={entry}
                onPress={
                  entry.kind === 'shareReply' && entry.shareKey
                    ? () => openReply(entry.shareKey!)
                    : entry.kind === 'paired'
                      ? () => navigation.navigate('Buddies')
                      : undefined
                }
              />
            ))}
            <Button
              style={{ alignSelf: 'center', paddingVertical: 8 }}
              onPress={clearAll}
            >
              <Text style={{ color: theme.colors.textAlt }}>
                {i18n.t('buddies_clearAll')}
              </Text>
            </Button>
          </>
        )}
      </ScrollView>
    </Wrapper>
  )
}
