import { useEffect } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import DetailsLayout from '@/components/ui/layout/DetailsLayout'
import useNow from '@/hooks/useNow'
import i18n from '@/lib/locales'
import type { RootStackParamList } from '@/types/rootStack'
import FollowUpInvitationCard from '@/features/buddies/components/FollowUpInvitationCard'
import InvitationAnswerSection from '@/features/buddies/components/InvitationAnswerSection'
import useAnswerShare from '@/features/buddies/hooks/useAnswerShare'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { isOpenFollowUpInvitation } from '@/features/buddies/lib/linkedPlans'
import { incomingShareKey } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

type Props = NativeStackScreenProps<RootStackParamList, 'Follow-Up Invitation'>

/**
 * A buddy's Follow-up invitation, read-only, in a sheet: what it is and when,
 * then who organized it and the User's answer. Going or Can't Make It can
 * change while it's open. Leaves once the invitation is cancelled, wiped (a day
 * after the visit), or its buddy is gone.
 */
export default function FollowUpInvitationScreen({ route, navigation }: Props) {
  const { from, shareId } = route.params
  const { now } = useNow()
  const enabled = useBuddiesEnabled()
  const share = useBuddies(
    (state) => state.incomingShares[incomingShareKey(from, shareId)]
  )
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === from)
  )
  const { busy, answer } = useAnswerShare('follow_up_details')
  const open = enabled && !!buddy && isOpenFollowUpInvitation(share, now)

  useEffect(() => {
    if (!open && navigation.canGoBack()) navigation.goBack()
  }, [open, navigation])

  if (!open || !buddy) return null
  return (
    <DetailsLayout sheet title={i18n.t('buddies_followUp')}>
      <FollowUpInvitationCard
        share={share}
        buddyName={buddyDisplayName(buddy)}
        now={now}
      />
      <InvitationAnswerSection
        from={from}
        share={share}
        status={share.status === 'cancelled' ? 'pending' : share.status}
        answering={{
          busy,
          answer: (target, reply) =>
            void answer(
              incomingShareKey(target.from, target.shareId),
              'followUp',
              reply
            ),
        }}
      />
    </DetailsLayout>
  )
}
