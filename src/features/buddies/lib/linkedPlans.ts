import moment from 'moment'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  storedDayKey,
} from '@/lib/normalizeDate'
import { sharedNoteFields } from '@/features/buddies/lib/sharedNotes'
import { hasSharedEventEnded } from '@/features/buddies/lib/shareTiming'
import type { BuddyShareRef, DayPlan, LinkedShare } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import {
  incomingShareKey,
  type IncomingShare,
  type IncomingShareStatus,
} from '@/features/buddies/lib/state'

const DEFAULT_LINKED_MINUTES = 60

export const organizerMinutes = (share: Pick<IncomingShare, 'details'>) =>
  share.details.m ?? DEFAULT_LINKED_MINUTES

export type LinkedPlanChanges = {
  add: DayPlan[]
  update: (Partial<DayPlan> & { id: string })[]
  remove: string[]
}

const sameRef = (ref: BuddyShareRef | undefined, share: IncomingShare) =>
  ref?.from === share.from && ref.shareId === share.shareId

export const linkedPlanId = ({ from, shareId }: BuddyShareRef) =>
  `buddy.${from}.${shareId}`

const byKeepOrder = (id: string) => (a: DayPlan, b: DayPlan) => {
  if (a.id === b.id) return 0
  if (a.id === id) return -1
  if (b.id === id) return 1
  return a.id < b.id ? -1 : 1
}

function mirroredFields(share: IncomingShare, ownMinutes: boolean) {
  const { details } = share
  const { noteDoc } = sharedNoteFields(details)
  return {
    date: moment(details.d, 'YYYY-MM-DD').hour(12).toDate(),

    startTimeInMinutes: details.s ?? DEFAULT_START_TIME_IN_MINUTES,
    anytime: details.s === undefined ? true : undefined,
    ...(ownMinutes ? {} : { minutes: organizerMinutes(share) }),
    title: details.title,
    location: details.location,
    note: details.note,

    noteDoc,
  }
}

const differs = (
  plan: DayPlan,
  share: IncomingShare,
  fields: ReturnType<typeof mirroredFields>
) =>
  storedDayKey(plan.date) !== share.details.d ||
  plan.startTimeInMinutes !== fields.startTimeInMinutes ||
  !!plan.anytime !== !!fields.anytime ||
  (fields.minutes !== undefined && plan.minutes !== fields.minutes) ||
  plan.title !== fields.title ||
  plan.note !== fields.note ||
  JSON.stringify(plan.noteDoc) !== JSON.stringify(fields.noteDoc) ||
  JSON.stringify(plan.location) !== JSON.stringify(fields.location)

const linkedTo = (
  share: IncomingShare,
  previous?: LinkedShare
): LinkedShare => ({
  from: share.from,
  shareId: share.shareId,
  rev: share.rev,
  ...(previous?.ownMinutes ? { ownMinutes: true } : {}),
})

export function reconcileLinkedPlans(
  dayPlans: DayPlan[],
  shares: IncomingShare[],
  {
    now,
    deletedPlanIds = new Set<string>(),
    answered = new Set<string>(),
  }: {
    now: number
    deletedPlanIds?: ReadonlySet<string>
    answered?: ReadonlySet<string>
  }
): LinkedPlanChanges {
  const changes: LinkedPlanChanges = { add: [], update: [], remove: [] }
  for (const share of shares) {
    if (share.type !== 'plan' || hasSharedEventEnded(share, now)) continue
    const linked = dayPlans.filter((plan) => sameRef(plan.buddyShare, share))
    if (share.status === 'cancelled' || share.status === 'declined') {
      changes.remove.push(...linked.map((plan) => plan.id))
      continue
    }

    if (share.status === 'pending' && linked.length === 0) continue
    const id = linkedPlanId(share)
    const [plan, ...duplicates] = [...linked].sort(byKeepOrder(id))
    for (const duplicate of duplicates) {
      if (duplicate.id !== plan.id) changes.remove.push(duplicate.id)
    }
    if (!plan) {
      if (
        deletedPlanIds.has(id) &&
        !answered.has(incomingShareKey(share.from, share.shareId))
      )
        continue
      changes.add.push({
        id,
        ...mirroredFields(share, false),
        minutes: organizerMinutes(share),
        buddyShare: linkedTo(share),
      })
      continue
    }
    const held = plan.buddyShare?.rev

    if (held !== undefined && held > share.rev) continue
    const fields = mirroredFields(share, !!plan.buddyShare?.ownMinutes)
    if (held !== share.rev || differs(plan, share, fields))
      changes.update.push({
        id: plan.id,
        ...fields,
        buddyShare: linkedTo(share, plan.buddyShare),
      })
  }
  return changes
}

export function sharesLeftUnlinked(
  previous: DayPlan[],
  current: DayPlan[]
): string[] {
  const remaining = new Set(current.map((plan) => plan.id))
  const stillLinked = new Set(
    current.flatMap(({ buddyShare }) =>
      buddyShare ? [incomingShareKey(buddyShare.from, buddyShare.shareId)] : []
    )
  )
  const unlinked = new Set<string>()
  for (const plan of previous) {
    if (!plan.buddyShare || remaining.has(plan.id)) continue
    const key = incomingShareKey(plan.buddyShare.from, plan.buddyShare.shareId)
    if (!stillLinked.has(key)) unlinked.add(key)
  }
  return [...unlinked]
}

export function sharesJustAccepted(
  previous: Record<string, IncomingShare>,
  current: Record<string, IncomingShare>
): Set<string> {
  return new Set(
    Object.entries(current)
      .filter(
        ([key, share]) =>
          share.status === 'going' &&
          share.unsentReplyRev !== undefined &&
          share.unsentReplyRev !== previous[key]?.unsentReplyRev
      )
      .map(([key]) => key)
  )
}

export const isShownPlanShare = (
  share: IncomingShare | undefined,
  now: number
): share is IncomingShare =>
  share?.type === 'plan' &&
  share.status !== 'cancelled' &&
  share.expiresAt > now

export const isOpenPlanInvitation = (
  share: IncomingShare | undefined,
  now: number
): share is IncomingShare =>
  isShownPlanShare(share, now) && !hasSharedEventEnded(share, now)

export const isOpenFollowUpInvitation = (
  share: IncomingShare | undefined,
  now: number
): share is IncomingShare =>
  share?.type === 'followUp' &&
  share.status !== 'cancelled' &&
  share.expiresAt > now

export function effectiveShareStatus(
  share: IncomingShare,
  dayPlans: DayPlan[]
): IncomingShareStatus {
  if (
    share.status === 'pending' &&
    dayPlans.some((plan) => sameRef(plan.buddyShare, share))
  )
    return 'going'
  return share.status
}

export function forgetBuddiesInData(
  dayPlans: DayPlan[],
  visits: Visit[],
  removed: ReadonlySet<string>
): {
  dayPlans: (Partial<DayPlan> & { id: string })[]
  visits: (Partial<Visit> & { id: string })[]
} {
  const keep = (ids: string[] | undefined) => {
    const kept = ids?.filter((id) => !removed.has(id))
    return kept?.length ? kept : undefined
  }
  const planChanges: (Partial<DayPlan> & { id: string })[] = []
  for (const plan of dayPlans) {
    const unlink = plan.buddyShare && removed.has(plan.buddyShare.from)
    const invited = plan.buddies?.some((id) => removed.has(id))
    if (!unlink && !invited) continue
    planChanges.push({
      id: plan.id,
      ...(invited ? { buddies: keep(plan.buddies) } : {}),
      ...(unlink ? { buddyShare: undefined } : {}),
    })
  }
  const visitChanges: (Partial<Visit> & { id: string })[] = []
  for (const visit of visits) {
    const { followUp } = visit
    if (!followUp?.buddies?.some((id) => removed.has(id))) continue
    visitChanges.push({
      id: visit.id,
      followUp: { ...followUp, buddies: keep(followUp.buddies) },
    })
  }
  return { dayPlans: planChanges, visits: visitChanges }
}
