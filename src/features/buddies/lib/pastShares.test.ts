import { describe, expect, it } from 'vitest'
import {
  isOpenPlanInvitation,
  isShownPlanShare,
  linkedPlanId,
  reconcileLinkedPlans,
} from '@/features/buddies/lib/linkedPlans'
import type { ShareDetails } from '@/features/buddies/lib/schemas'
import {
  buildOutgoingShares,
  FOLLOW_UP_SHARE_RETENTION_MS,
  planShareKey,
  PLAN_SHARE_RETENTION_MS,
  shareEventExpiry,
} from '@/features/buddies/lib/shares'
import { sharedEventEndsAt } from '@/features/buddies/lib/shareTiming'
import {
  awaitsAnswer,
  incomingShareKey,
  withoutExpired,
  withPendingInvitesQueued,
  type IncomingShare,
  type OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import { pair, setup } from '@/features/buddies/lib/testing/engineHarness'
import type { Contact } from '@/types/contact'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

const DAY = 24 * 60 * 60 * 1000

/** A shared Plan as the sender builds it: kept a month after it ends. */
const planSpec = (
  recipients: string[],
  details: ShareDetails = { d: '2026-09-26', s: 600, m: 60 }
): OutgoingShareSpec => {
  const endsAt = sharedEventEndsAt({ type: 'plan', details })
  return {
    key: planShareKey('sat'),
    type: 'plan',
    details,
    recipients,
    endsAt,
    expiresAt: endsAt + PLAN_SHARE_RETENTION_MS,
  }
}

async function duo() {
  const env = setup()
  const levi = env.user('Levi')
  const anna = env.user('Anna')
  await pair(levi, anna)
  const key = () =>
    incomingShareKey(
      levi.inboxId,
      levi.engine.shareIdForKey(planShareKey('sat'))
    )
  return { env, levi, anna, key }
}

describe('a shared Plan after it happens', () => {
  it('stays with buddies for a month, but takes no answers', async () => {
    const { env, levi, anna, key } = await duo()
    const spec = planSpec([anna.inboxId])
    levi.setShares([spec])
    await levi.engine.publishShares()
    await anna.engine.sync()
    expect(anna.store.getState().incomingShares[key()].expiresAt).toBe(
      spec.endsAt + PLAN_SHARE_RETENTION_MS
    )

    env.advance(spec.endsAt + DAY - env.now())
    await anna.engine.replyToShare(key(), 'going')
    expect(anna.store.getState().incomingShares[key()].status).toBe('pending')

    const state = anna.store.getState()
    expect(
      Object.keys(withoutExpired(state, spec.endsAt + 29 * DAY).incomingShares)
    ).toEqual([key()])
    expect(
      withoutExpired(state, spec.endsAt + 31 * DAY).incomingShares
    ).toEqual({})
  })

  it('is never sent to anyone new, as after updating to this version', async () => {
    const { env, levi, anna } = await duo()
    // Sep 20: before the harness's clock (Sep 23), inside the month.
    levi.setShares([
      planSpec([anna.inboxId], { d: '2026-09-20', s: 600, m: 60 }),
    ])
    const pushes = env.fake.pushes.length
    await levi.engine.publishShares()
    await anna.engine.sync()
    expect(anna.store.getState().incomingShares).toEqual({})
    expect(env.fake.pushes.length).toBe(pushes)
    expect(levi.store.getState().outgoingShares).toEqual({})
  })

  it('sends its changes quietly to buddies who have it', async () => {
    const { env, levi, anna, key } = await duo()
    const spec = planSpec([anna.inboxId])
    levi.setShares([spec])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const notifications = anna.store.getState().notifications.length

    env.advance(spec.endsAt + DAY - env.now())
    const moved = {
      ...spec,
      details: { ...spec.details, location: { name: 'East gate' } },
    }
    levi.setShares([moved])
    const pushes = env.fake.pushes.length
    await levi.engine.publishShares()
    await anna.engine.sync()
    // A new place would push before the Plan; after it, nothing alerts.
    expect(env.fake.pushes.length).toBe(pushes)
    expect(
      anna.store.getState().incomingShares[key()].details.location
    ).toEqual({ name: 'East gate' })
    expect(anna.store.getState().notifications).toHaveLength(notifications)

    // Deleting it then cancels it for her, quietly too.
    levi.setShares([])
    await levi.engine.publishShares()
    await anna.engine.sync()
    expect(env.fake.pushes.length).toBe(pushes)
    expect(anna.store.getState().incomingShares[key()].status).toBe('cancelled')
  })

  it('tells builds that keep a share a day when to wipe it', () => {
    const ends = Date.parse('2026-09-26T15:00:00Z')
    expect(
      shareEventExpiry({ endsAt: ends, expiresAt: ends + 30 * DAY })
    ).toEqual({ expiresAt: ends + DAY, keepUntil: ends + 30 * DAY })
    // A Follow-up already lasts a day: nothing to add.
    expect(shareEventExpiry({ endsAt: ends, expiresAt: ends + DAY })).toEqual({
      expiresAt: ends + DAY,
    })
  })
})

describe('the bell and Plan Details after a Plan happens', () => {
  const details = { d: '2026-09-26', s: 600, m: 60 }
  const ends = sharedEventEndsAt({ type: 'plan', details })
  const share = (status: IncomingShare['status']): IncomingShare => ({
    from: 'levi',
    shareId: 'share-1',
    type: 'plan',
    rev: 1,
    details,
    expiresAt: ends + PLAN_SHARE_RETENTION_MS,
    receivedAt: 0,
    status,
  })
  const key = incomingShareKey('levi', 'share-1')
  const entry = {
    id: 'n1',
    kind: 'shareInvite' as const,
    at: 0,
    read: false,
    from: 'levi',
    name: 'Levi',
    shareKey: key,
    shareType: 'plan' as const,
  }

  it('stops holding an unanswered invitation in the bell', () => {
    const state = {
      incomingClaims: [],
      incomingShares: { [key]: share('pending') },
    }
    expect(awaitsAnswer(entry, state, ends - DAY)).toBe(true)
    expect(awaitsAnswer(entry, state, ends + DAY)).toBe(false)
    const queued = (now: number) =>
      withPendingInvitesQueued(
        {
          notifications: [],
          incomingShares: state.incomingShares,
          buddies: [{ inboxId: 'levi', name: 'Levi' } as never],
        },
        now
      )
    expect(queued(ends - DAY)).toHaveLength(1)
    expect(queued(ends + DAY)).toEqual([])
  })

  it('still opens it in Plan Details, without an answer', () => {
    expect(isShownPlanShare(share('pending'), ends + DAY)).toBe(true)
    expect(isOpenPlanInvitation(share('pending'), ends + DAY)).toBe(false)
    expect(isOpenPlanInvitation(share('pending'), ends - DAY)).toBe(true)
    expect(isShownPlanShare(share('pending'), ends + 31 * DAY)).toBe(false)
  })

  it('leaves the buddy’s own copy alone once it has happened', () => {
    const plan = {
      id: linkedPlanId({ from: 'levi', shareId: 'share-1' }),
      date: new Date(ends),
      startTimeInMinutes: 600,
      minutes: 60,
      buddyShare: { from: 'levi', shareId: 'share-1' },
    } as DayPlan
    const after = { now: ends + DAY }
    // Cancelled or declined after the Plan: it's history, not removed.
    expect(reconcileLinkedPlans([plan], [share('cancelled')], after)).toEqual({
      add: [],
      update: [],
      remove: [],
    })
    expect(
      reconcileLinkedPlans(
        [plan],
        [{ ...share('going'), details: { ...details, title: 'Renamed' } }],
        after
      ).update
    ).toEqual([])
    // Before it, a cancel still removes it.
    expect(
      reconcileLinkedPlans([plan], [share('cancelled')], { now: ends - DAY })
        .remove
    ).toEqual([plan.id])
  })
})

describe('retention by kind', () => {
  it('keeps Plans a month and Follow-ups a day', () => {
    const now = Date.parse('2026-09-23T15:00:00Z')
    const contact = { id: 'c1', name: 'Sam' } as Contact
    const dayPlan = (date: string, id: string) =>
      ({
        id,
        date: new Date(`${date}T12:00:00`),
        startTimeInMinutes: 600,
        minutes: 60,
        buddies: ['b'],
      }) as DayPlan
    const visit = (id: string, daysAgo: number) =>
      ({
        id,
        contact: { id: 'c1' },
        date: new Date(now - (daysAgo + 1) * DAY),
        isBibleStudy: false,
        followUp: {
          date: new Date(now - daysAgo * DAY),
          notifyMe: false,
          buddies: ['b'],
        },
      }) as Visit
    const specs = buildOutgoingShares({
      now,
      contacts: [contact],
      dayPlans: [
        dayPlan('2026-08-26', 'plan29'),
        dayPlan('2026-08-22', 'plan32'),
      ],
      visits: [visit('fu-hours', 0.5), visit('fu-days', 2)],
    })
    expect(specs.map((spec) => spec.key)).toEqual([
      'plan:plan29',
      'followUp:fu-hours',
    ])
    const followUp = specs.find((spec) => spec.type === 'followUp')!
    expect(followUp.expiresAt - followUp.endsAt).toBe(
      FOLLOW_UP_SHARE_RETENTION_MS
    )
  })
})
