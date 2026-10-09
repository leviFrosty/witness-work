import { Alert } from 'react-native'
import type { ContextMenuAction } from '@/components/ui/ContextMenu.types'
import useNow from '@/hooks/useNow'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { joinRequestStatus } from '@/features/buddies/lib/joinRequests'
import type { BuddyCardDay } from '@/features/buddies/lib/schemas'
import type { Buddy } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

/** Where Ask to Join was used, for `buddy_join_requested`. */
type Source = 'buddy_plans_for_day' | 'buddy_detail'

type CardPlan = BuddyCardDay['p'][number]

/**
 * Asking to join a buddy's Plan: its status, and the actions to ask or take a
 * request back. Withdrawing asks first; asking doesn't, since the buddy can
 * pass on it without a word.
 */
export default function useAskToJoin(source: Source) {
  // Ticks, so the cutoff before a Plan closes on a screen left open.
  const { now } = useNow()
  const askedToJoin = useBuddies((state) => state.askedToJoin)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const sending = useBuddiesSession((state) => state.sending > 0)

  const status = (buddy: Buddy, d: string, plan: CardPlan) => {
    const current = joinRequestStatus(
      { askedToJoin, incomingShares },
      buddy.inboxId,
      d,
      plan,
      now
    )
    // Not unsent while its first try is still on its way.
    return current.kind === 'asked' && sending
      ? { ...current, unsent: false }
      : current
  }

  const ask = (buddy: Buddy, d: string, plan: CardPlan, expiresAt: number) => {
    analytics.capture('buddy_join_requested', { source })
    buddiesEngine
      .askToJoin(buddy.inboxId, d, plan, expiresAt)
      .catch((error) =>
        alertBuddiesError(i18n.t('buddies_errorAskToJoinTitle'), error)
      )
  }

  const withdraw = (buddy: Buddy, requestId: string) =>
    Alert.alert(
      i18n.t('buddies_withdrawJoinRequestTitle'),
      i18n.t('buddies_withdrawJoinRequestBody', {
        name: buddyDisplayName(buddy),
      }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('buddies_withdrawJoinRequest'),
          style: 'destructive',
          onPress: () => {
            analytics.capture('buddy_join_request_withdrawn', { source })
            void buddiesEngine.withdrawJoinRequest(requestId)
          },
        },
      ]
    )

  /** The context menu entry for a buddy's Plan, if there's anything to do. */
  const menuAction = (
    buddy: Buddy,
    d: string,
    plan: CardPlan
  ): ContextMenuAction | undefined => {
    const current = status(buddy, d, plan)
    if (current.kind === 'canAsk')
      return {
        id: 'ask_to_join',
        title: i18n.t('buddies_askToJoin'),
        systemImage: 'person.badge.plus',
        onPress: () => ask(buddy, d, plan, current.expiresAt),
      }
    if (current.kind === 'asked')
      return {
        id: 'withdraw_join_request',
        title: i18n.t('buddies_withdrawJoinRequest'),
        systemImage: 'person.badge.minus',
        onPress: () => withdraw(buddy, current.request.id),
      }
    return undefined
  }

  return { status, ask, withdraw, menuAction }
}
