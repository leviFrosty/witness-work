import { useEffect } from 'react'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { PlanListItem } from '@/types/timeEntry'
import useNow from '@/hooks/useNow'
import { storedDateToLocalDate } from '@/lib/normalizeDate'
import { getPlansIntersectingDay } from '@/lib/recurrence'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackParamList } from '@/types/rootStack'
import type { BuddyShareRef } from '@/types/timeEntry'
import useAnswerShare from '@/features/buddies/hooks/useAnswerShare'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { isOpenPlanInvitation } from '@/features/buddies/lib/linkedPlans'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import { incomingShareKey } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import InvitationPlanDetails from '@/features/plans/components/InvitationPlanDetails'
import OwnPlanDetails from '@/features/plans/components/OwnPlanDetails'
import { planDayFromRouteDate } from '@/features/plans/lib/planDayDates'

type Props = NativeStackScreenProps<RootStackParamList, 'Plan Details'>

/**
 * One Plan, read-only, with Edit and the Plan's other actions in the header.
 * Leaves once the Plan is gone (deleted here, in the editor, or on another
 * device), except a buddy's invitation, which stays so a "Can't make it" can be
 * changed back.
 */
export default function PlanDetailsScreen({ route, navigation }: Props) {
  const {
    dayPlanId,
    recurringPlanId,
    date,
    share: invitationRef,
  } = route.params
  const { now } = useNow()
  const enabled = useBuddiesEnabled()
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const incomingShares = useBuddies((state) => state.incomingShares)
  const { busy, answer: sendAnswer } = useAnswerShare('plan_details')

  const dayPlan =
    (dayPlanId ? dayPlans.find((plan) => plan.id === dayPlanId) : undefined) ??
    (invitationRef
      ? dayPlans.find(
          (plan) =>
            plan.buddyShare?.from === invitationRef.from &&
            plan.buddyShare.shareId === invitationRef.shareId
        )
      : undefined)
  const day = date ? planDayFromRouteDate(date) : undefined
  const recurringPlan =
    !dayPlan && recurringPlanId && day
      ? recurringPlans.find((plan) => plan.id === recurringPlanId)
      : undefined
  // The Plan's local day: what Log as Time, Duplicate, and Edit are handed.
  const item: PlanListItem | undefined = dayPlan
    ? { type: 'day', date: storedDateToLocalDate(dayPlan.date), plan: dayPlan }
    : recurringPlan && day && getPlansIntersectingDay(day, [recurringPlan])[0]
      ? { type: 'recurring', date: day, plan: recurringPlan }
      : undefined
  const followedRef = dayPlan?.buddyShare ?? invitationRef
  const followed = followedRef
    ? incomingShares[incomingShareKey(followedRef.from, followedRef.shareId)]
    : undefined
  const invitation =
    enabled && isOpenPlanInvitation(followed, now) ? followed : undefined
  const gone = !item && !invitation

  // Deleted here, from the editor, on another device, or the invitation was
  // cancelled.
  useEffect(() => {
    if (gone && navigation.canGoBack()) navigation.goBack()
  }, [gone, navigation])

  /**
   * Answers the invitation, remembering it first: "Can't make it" removes the
   * linked Plan, and the screen falls back to the invitation.
   */
  const answer = (target: BuddyShareRef, reply: ShareReply) => {
    navigation.setParams({
      share: { from: target.from, shareId: target.shareId },
    })
    void sendAnswer(
      incomingShareKey(target.from, target.shareId),
      'plan',
      reply
    )
  }
  const answering = { busy, answer }

  if (item) {
    return (
      <OwnPlanDetails
        item={item}
        share={invitation}
        now={now}
        answering={answering}
      />
    )
  }
  if (invitation) {
    return <InvitationPlanDetails share={invitation} answering={answering} />
  }
  return null
}
