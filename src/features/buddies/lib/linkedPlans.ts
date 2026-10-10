import {
  DEFAULT_START_TIME_IN_MINUTES,
  normalizeDateForStorage,
} from '@/lib/normalizeDate'
import type { BuddyShareRef, DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import {
  incomingShareKey,
  type IncomingShare,
  type IncomingShareStatus,
} from '@/features/buddies/lib/state'

/** Planned minutes when a buddy's Plan has no duration. */
const DEFAULT_LINKED_MINUTES = 60

export type LinkedPlanChanges = {
  add: DayPlan[]
  update: (Partial<DayPlan> & { id: string })[]
  remove: string[]
}

const sameRef = (ref: BuddyShareRef | undefined, share: IncomingShare) =>
  ref?.from === share.from && ref.shareId === share.shareId

/**
 * The id every one of this User's devices gives the Plan that follows a share,
 * so two devices that both answer "Going" add the same Plan rather than two.
 * Inbox and share ids are base64url relay ids, which never contain the `.`
 * separator, so the id is unique per share and passes sync validation.
 */
export const linkedPlanId = ({ from, shareId }: BuddyShareRef) =>
  `buddy.${from}.${shareId}`

/**
 * Orders a share's linked Plans so the one to keep comes first: the one with
 * `id`, else the lowest id. Every device keeps the same one; keeping each its
 * own first copy let two devices delete each other's, and the deletions synced
 * removed both.
 */
const byKeepOrder = (id: string) => (a: DayPlan, b: DayPlan) => {
  if (a.id === b.id) return 0
  if (a.id === id) return -1
  if (b.id === id) return 1
  return a.id < b.id ? -1 : 1
}

/** The Plan fields a linked Plan mirrors from the buddy's invitation. */
function mirroredFields(share: IncomingShare) {
  const { details } = share
  return {
    date: normalizeDateForStorage(`${details.d}T12:00:00`),
    // An invitation with no start time is for an anytime Plan.
    startTimeInMinutes: details.s ?? DEFAULT_START_TIME_IN_MINUTES,
    anytime: details.s === undefined ? true : undefined,
    minutes: details.m ?? DEFAULT_LINKED_MINUTES,
    title: details.title,
    location: details.location,
    note: details.note,
  }
}

const differs = (plan: DayPlan, fields: ReturnType<typeof mirroredFields>) =>
  new Date(plan.date).getTime() !== fields.date.getTime() ||
  plan.startTimeInMinutes !== fields.startTimeInMinutes ||
  !!plan.anytime !== !!fields.anytime ||
  plan.minutes !== fields.minutes ||
  plan.title !== fields.title ||
  plan.note !== fields.note ||
  JSON.stringify(plan.location) !== JSON.stringify(fields.location)

/**
 * Keeps the Plans added by answering "Going" in step with buddies' Plans: adds
 * one for each accepted Plan invitation, applies the buddy's changes, and
 * removes it when they cancel or the User changes their answer. A share that
 * has lapsed leaves its Plan alone — it's history by then.
 *
 * A linked Plan whose id is in `deletedPlanIds` was deleted, here or on another
 * of this User's devices (which answered "Can't make it" there), so it's only
 * added again for a share in `answered`: one the User just said "Going" to on
 * this device. Each device keeps its own answer, so otherwise a device still
 * showing "Going" would bring back a Plan deleted elsewhere.
 */
export function reconcileLinkedPlans(
  dayPlans: DayPlan[],
  shares: IncomingShare[],
  {
    deletedPlanIds = new Set<string>(),
    answered = new Set<string>(),
  }: {
    deletedPlanIds?: ReadonlySet<string>
    answered?: ReadonlySet<string>
  } = {}
): LinkedPlanChanges {
  const changes: LinkedPlanChanges = { add: [], update: [], remove: [] }
  for (const share of shares) {
    if (share.type !== 'plan') continue
    const linked = dayPlans.filter((plan) => sameRef(plan.buddyShare, share))
    if (share.status === 'cancelled' || share.status === 'declined') {
      changes.remove.push(...linked.map((plan) => plan.id))
      continue
    }
    // Another of this User's devices may have said "Going" — the linked Plan
    // arrives through iCloud while this device still shows the invitation.
    if (share.status === 'pending' && linked.length === 0) continue
    const fields = mirroredFields(share)
    const id = linkedPlanId(share)
    const [plan, ...duplicates] = [...linked].sort(byKeepOrder(id))
    for (const duplicate of duplicates) {
      // Removing a copy under the kept id would take the kept Plan with it.
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
        ...fields,
        buddyShare: { from: share.from, shareId: share.shareId },
      })
    } else if (differs(plan, fields)) {
      changes.update.push({ id: plan.id, ...fields })
    }
  }
  return changes
}

/**
 * The invitations (by `incomingShareKey`) whose last linked Plan is gone from
 * `current`. Deleting it means "Can't make it"; a share that still has a Plan
 * (the copy `reconcileLinkedPlans` kept when it removed a duplicate) doesn't
 * count, and neither does a Plan that stays but stops following its share.
 */
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

/**
 * The invitations (by `incomingShareKey`) the User just answered "Going" to on
 * this device: answering stamps a new `unsentReplyRev`, which delivery later
 * clears and a buddy's update keeps.
 */
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

/**
 * A buddy's Plan invitation that can still be answered: not cancelled, and not
 * yet past its expiry.
 */
export const isOpenPlanInvitation = (
  share: IncomingShare | undefined,
  now: number
): share is IncomingShare =>
  share?.type === 'plan' &&
  share.status !== 'cancelled' &&
  share.expiresAt > now

/**
 * A buddy's Follow-up invitation that's still on this phone: not cancelled, and
 * not yet wiped (a day after the visit).
 */
export const isOpenFollowUpInvitation = (
  share: IncomingShare | undefined,
  now: number
): share is IncomingShare =>
  share?.type === 'followUp' &&
  share.status !== 'cancelled' &&
  share.expiresAt > now

/**
 * What to show for an invitation: a linked Plan synced from another of this
 * User's devices means they already said "Going".
 */
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

/**
 * Takes buddies who are gone off this User's Plans and Follow-ups: they're no
 * longer invited (so pairing again never re-sends an old invitation), and a
 * Plan that followed one of their invitations becomes an ordinary Plan.
 */
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
