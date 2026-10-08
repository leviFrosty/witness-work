import moment from 'moment'
import { storedDayKey } from '@/lib/normalizeDate'
import { followUpShareKey, planShareKey } from '@/features/buddies/lib/shares'
import type { BuddiesState } from '@/features/buddies/lib/state'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

/**
 * `YYYY-MM` months, up to today, in which the User went out with a buddy: a
 * Plan they joined from an invitation, one of their own Plans or Follow-ups a
 * buddy said they're going to, or a buddy's invitation they're going to.
 *
 * Replies and invitations expire, so the Two by Two badge records these months
 * in its ledger as soon as they're seen here.
 */
export const buddyTogetherMonths = ({
  state,
  dayPlans,
  visits,
  now,
}: {
  state: Pick<
    BuddiesState,
    'outgoingShares' | 'shareReplies' | 'incomingShares'
  >
  dayPlans: readonly DayPlan[]
  visits: readonly Visit[]
  now: Date
}): string[] => {
  const today = moment(now).format('YYYY-MM-DD')
  const months = new Set<string>()
  const add = (day: string) => {
    if (day <= today) months.add(day.slice(0, 7))
  }
  const someoneGoing = (key: string) => {
    const shareId = state.outgoingShares[key]?.shareId
    if (!shareId) return false
    return Object.values(state.shareReplies[shareId] ?? {}).some(
      (reply) => reply.status === 'going'
    )
  }

  for (const plan of dayPlans) {
    if (
      plan.buddyShare ||
      (plan.buddies?.length && someoneGoing(planShareKey(plan.id)))
    )
      add(storedDayKey(plan.date))
  }
  for (const visit of visits) {
    const followUp = visit.followUp
    if (followUp?.buddies?.length && someoneGoing(followUpShareKey(visit.id)))
      add(moment(followUp.date).format('YYYY-MM-DD'))
  }
  for (const share of Object.values(state.incomingShares)) {
    if (share.status === 'going') add(share.details.d)
  }
  return [...months].sort()
}
