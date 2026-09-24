import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { BuddyShareRef, DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import type {
  IncomingShare,
  IncomingShareStatus,
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

/** The Plan fields a linked Plan mirrors from the buddy's invitation. */
function mirroredFields(share: IncomingShare) {
  const { details } = share
  return {
    date: normalizeDateForStorage(`${details.d}T12:00:00`),
    startTimeInMinutes: details.s,
    minutes: details.m ?? DEFAULT_LINKED_MINUTES,
    title: details.title,
    location: details.location,
    note: details.note,
  }
}

const differs = (plan: DayPlan, fields: ReturnType<typeof mirroredFields>) =>
  new Date(plan.date).getTime() !== fields.date.getTime() ||
  plan.startTimeInMinutes !== fields.startTimeInMinutes ||
  plan.minutes !== fields.minutes ||
  plan.title !== fields.title ||
  plan.note !== fields.note ||
  JSON.stringify(plan.location) !== JSON.stringify(fields.location)

/**
 * Keeps the Plans added by answering "Going" in step with buddies' Plans: adds
 * one for each accepted Plan invitation, applies the buddy's changes, and
 * removes it when they cancel or the User changes their answer. A share that
 * has lapsed leaves its Plan alone — it's history by then.
 */
export function reconcileLinkedPlans(
  dayPlans: DayPlan[],
  shares: IncomingShare[],
  newId: () => string
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
    const [plan, ...duplicates] = linked
    changes.remove.push(...duplicates.map((duplicate) => duplicate.id))
    if (!plan) {
      changes.add.push({
        id: newId(),
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
