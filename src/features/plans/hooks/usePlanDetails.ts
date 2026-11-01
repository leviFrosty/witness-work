import useNow from '@/hooks/useNow'
import { storedDateToLocalDate } from '@/lib/normalizeDate'
import { getPlansIntersectingDay } from '@/lib/recurrence'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackParamList } from '@/types/rootStack'
import type { BuddyShareRef, PlanListItem } from '@/types/timeEntry'
import useAnswerShare from '@/features/buddies/hooks/useAnswerShare'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import {
  isOpenPlanInvitation,
  isShownPlanShare,
} from '@/features/buddies/lib/linkedPlans'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import { incomingShareKey } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { planDayFromRouteDate } from '@/features/plans/lib/planDayDates'

export default function usePlanDetails(
  params: RootStackParamList['Plan Details'],
  options: {
    onAnswer?: (target: BuddyShareRef) => void
  } = {}
) {
  const { dayPlanId, recurringPlanId, date, share: invitationRef } = params
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

  const item: PlanListItem | undefined = dayPlan
    ? { type: 'day', date: storedDateToLocalDate(dayPlan.date), plan: dayPlan }
    : recurringPlan && day && getPlansIntersectingDay(day, [recurringPlan])[0]
      ? { type: 'recurring', date: day, plan: recurringPlan }
      : undefined
  const followedRef = dayPlan?.buddyShare ?? invitationRef
  const followed = followedRef
    ? incomingShares[incomingShareKey(followedRef.from, followedRef.shareId)]
    : undefined
  const shared =
    enabled && isShownPlanShare(followed, now) ? followed : undefined

  const invitation =
    shared && isOpenPlanInvitation(shared, now) ? shared : undefined

  const answer = (target: BuddyShareRef, reply: ShareReply) => {
    options.onAnswer?.(target)
    void sendAnswer(
      incomingShareKey(target.from, target.shareId),
      'plan',
      reply
    )
  }

  return {
    now,
    item,
    shared,
    invitation,
    gone: !item && !shared,
    answering: { busy, answer },
  }
}
