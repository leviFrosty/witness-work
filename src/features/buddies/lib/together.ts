import moment from 'moment'
import { storedDayKey } from '@/lib/normalizeDate'
import type { Contact } from '@/types/contact'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import { effectiveShareStatus } from '@/features/buddies/lib/linkedPlans'
import type { ShareDetails, ShareType } from '@/features/buddies/lib/schemas'
import {
  followUpShareDetails,
  followUpShareKey,
  planShareDetails,
  planShareKey,
} from '@/features/buddies/lib/shares'
import type { IncomingShare, ReceivedReply } from '@/features/buddies/lib/state'

/**
 * One upcoming Plan or Follow-up that involves a buddy: either they invited
 * this User (`incoming`) or this User invited them (`outgoing`).
 */
export type TogetherItem = {
  key: string
  type: ShareType
  details: ShareDetails
} & (
  | {
      direction: 'incoming'
      /** The incoming share key, for answering. */
      shareKey: string
      status: 'pending' | 'going' | 'declined'
      /** The linked Plan going added, if any. */
      planId?: string
    }
  | {
      direction: 'outgoing'
      /** The buddy's answer; `invited` until they reply. */
      status: 'invited' | 'going' | 'declined'
      planId?: string
      /** The Visit whose Follow-up this is. */
      visitId?: string
    }
)

const byWhen = (a: TogetherItem, b: TogetherItem) =>
  a.details.d === b.details.d
    ? (a.details.s ?? -1) - (b.details.s ?? -1)
    : a.details.d < b.details.d
      ? -1
      : 1

/**
 * What's planned with one buddy from today on, soonest first. Invitations from
 * them still waiting on this User's answer are split out; cancelled ones are
 * dropped.
 */
export function buildTogether(input: {
  inboxId: string
  incomingShares: Record<string, IncomingShare>
  dayPlans: DayPlan[]
  visits: Visit[]
  contacts: Pick<Contact, 'id' | 'name' | 'address' | 'coordinate'>[]
  /** The buddy's answer to one of this User's share keys. */
  replyFor: (shareKey: string) => ReceivedReply | undefined
  today: Date
}): { needsAnswer: TogetherItem[]; together: TogetherItem[] } {
  const today = moment(input.today).format('YYYY-MM-DD')
  const needsAnswer: TogetherItem[] = []
  const together: TogetherItem[] = []

  for (const [shareKey, share] of Object.entries(input.incomingShares)) {
    if (share.from !== input.inboxId || share.details.d < today) continue
    const status = effectiveShareStatus(share, input.dayPlans)
    if (status === 'cancelled') continue
    const linked = input.dayPlans.find(
      (plan) =>
        plan.buddyShare?.from === share.from &&
        plan.buddyShare.shareId === share.shareId
    )
    const item: TogetherItem = {
      key: `in:${shareKey}`,
      type: share.type,
      details: share.details,
      direction: 'incoming',
      shareKey,
      status,
      planId: linked?.id,
    }
    if (status === 'pending') needsAnswer.push(item)
    else together.push(item)
  }

  for (const plan of input.dayPlans) {
    if (
      plan.buddyShare ||
      !plan.buddies?.includes(input.inboxId) ||
      storedDayKey(plan.date) < today
    )
      continue
    together.push({
      key: `plan:${plan.id}`,
      type: 'plan',
      details: planShareDetails(plan),
      direction: 'outgoing',
      status: input.replyFor(planShareKey(plan.id))?.status ?? 'invited',
      planId: plan.id,
    })
  }

  const contacts = new Map(input.contacts.map((c) => [c.id, c]))
  for (const visit of input.visits) {
    const followUp = visit.followUp
    if (
      !followUp?.buddies?.includes(input.inboxId) ||
      followUp.dismissed ||
      moment(followUp.date).format('YYYY-MM-DD') < today
    )
      continue
    together.push({
      key: `followUp:${visit.id}`,
      type: 'followUp',
      details: followUpShareDetails(followUp, contacts.get(visit.contact.id)),
      direction: 'outgoing',
      status: input.replyFor(followUpShareKey(visit.id))?.status ?? 'invited',
      visitId: visit.id,
    })
  }

  return {
    needsAnswer: needsAnswer.sort(byWhen),
    together: together.sort(byWhen),
  }
}
