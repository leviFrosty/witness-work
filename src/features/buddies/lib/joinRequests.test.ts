import moment from 'moment'
import { describe, expect, it } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { RecurringPlanFrequencies, type RecurringPlan } from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'
import {
  findJoinRequestPlan,
  joinRequestExpiry,
  joinRequestInvite,
  joinRequestStatus,
  overlappingOwnPlans,
} from '@/features/buddies/lib/joinRequests'
import type {
  IncomingShare,
  OutgoingJoinRequest,
} from '@/features/buddies/lib/state'

const thursday = '2026-10-08'
const nine = { s: 540, m: 120 }

const dayPlan = (id: string, fields: Partial<DayPlan> = {}): DayPlan => ({
  id,
  date: normalizeDateForStorage(`${thursday}T12:00:00`),
  minutes: 120,
  startTimeInMinutes: 540,
  ...fields,
})

const asked = (
  fields: Partial<OutgoingJoinRequest> = {}
): OutgoingJoinRequest => ({
  to: 'anna',
  id: 'r1',
  d: thursday,
  ...nine,
  expiresAt: joinRequestExpiry(thursday, 540),
  askedAt: 0,
  rev: 0,
  sentRev: 0,
  attempted: true,
  pushed: true,
  ...fields,
})

const invite = (fields: Partial<IncomingShare> = {}): IncomingShare => ({
  from: 'anna',
  shareId: 's1',
  type: 'plan',
  rev: 1,
  details: { d: thursday, ...nine },
  expiresAt: Number.MAX_SAFE_INTEGER,
  receivedAt: 0,
  status: 'pending',
  ...fields,
})

describe('joinRequestStatus', () => {
  const dayBefore = moment(thursday).subtract(1, 'day').valueOf()

  it('can ask until two hours before the Plan starts', () => {
    const empty = { askedToJoin: {}, incomingShares: {} }
    expect(joinRequestStatus(empty, 'anna', thursday, nine, dayBefore)).toEqual(
      { kind: 'canAsk', expiresAt: joinRequestExpiry(thursday, 540) }
    )
    const at = (time: string) => moment(`${thursday}T${time}`).valueOf()
    expect(
      joinRequestStatus(empty, 'anna', thursday, nine, at('06:59')).kind
    ).toBe('canAsk')
    expect(
      joinRequestStatus(empty, 'anna', thursday, nine, at('07:01')).kind
    ).toBe('none')
    // No start time reads as noon.
    expect(
      joinRequestStatus(empty, 'anna', thursday, { m: 60 }, at('09:30')).kind
    ).toBe('canAsk')
  })

  it('stops counting a request once its Plan has started', () => {
    const lapsed = asked({ expiresAt: dayBefore - 1 })
    const state = { askedToJoin: { r1: lapsed }, incomingShares: {} }
    expect(
      joinRequestStatus(state, 'anna', thursday, nine, dayBefore).kind
    ).toBe('canAsk')
  })

  it('shows Asked for this Plan only, and not once withdrawn', () => {
    const state = { askedToJoin: { r1: asked() }, incomingShares: {} }
    expect(
      joinRequestStatus(state, 'anna', thursday, nine, dayBefore)
    ).toMatchObject({ kind: 'asked', request: { id: 'r1' } })
    expect(
      joinRequestStatus(state, 'anna', thursday, { s: 900, m: 60 }, dayBefore)
        .kind
    ).toBe('canAsk')
    expect(
      joinRequestStatus(
        { askedToJoin: { r1: asked({ withdrawn: true }) }, incomingShares: {} },
        'anna',
        thursday,
        nine,
        dayBefore
      ).kind
    ).toBe('canAsk')
  })

  it('offers nothing past three open requests with one buddy', () => {
    const askedToJoin = Object.fromEntries(
      [540, 600, 660].map((s) => [`r${s}`, asked({ id: `r${s}`, s })])
    )
    const state = { askedToJoin, incomingShares: {} }
    expect(
      joinRequestStatus(state, 'anna', thursday, { s: 720, m: 60 }, dayBefore)
        .kind
    ).toBe('none')
    expect(
      joinRequestStatus(state, 'mom', thursday, { s: 720, m: 60 }, dayBefore)
        .kind
    ).toBe('canAsk')
  })

  it('offers nothing once the buddy has invited this User that day', () => {
    const state = { askedToJoin: {}, incomingShares: { k: invite() } }
    expect(joinRequestStatus(state, 'anna', thursday, nine, dayBefore)).toEqual(
      { kind: 'none' }
    )
    const cancelled = {
      askedToJoin: {},
      incomingShares: { k: invite({ status: 'cancelled' }) },
    }
    expect(
      joinRequestStatus(cancelled, 'anna', thursday, nine, dayBefore).kind
    ).toBe('canAsk')
  })
})

describe('joinRequestInvite', () => {
  const request = { from: 'levi', d: thursday, ...nine }
  const targetOf = (invite: ReturnType<typeof joinRequestInvite>) =>
    invite.kind === 'invite' ? invite.target : undefined

  it("opens the owner's one-time Plan at that time with the buddy added", () => {
    const target = targetOf(
      joinRequestInvite(
        request,
        [dayPlan('afternoon', { startTimeInMinutes: 900 }), dayPlan('morning')],
        []
      )
    )
    expect(target).toMatchObject({
      existingDayPlanId: 'morning',
      inviteBuddies: ['levi'],
    })
  })

  it('seeds a new one-time Plan from the recurring instance there', () => {
    const weekly: RecurringPlan = {
      id: 'weekly',
      startDate: normalizeDateForStorage('2026-10-01T12:00:00'),
      minutes: 120,
      startTimeInMinutes: 540,
      title: 'Cart witnessing',
      categoryId: 'cart',
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    }
    const target = targetOf(joinRequestInvite(request, [], [weekly]))
    expect(target?.existingDayPlanId).toBeUndefined()
    expect(target).toMatchObject({
      inviteBuddies: ['levi'],
      prefill: { minutes: 120, title: 'Cart witnessing', categoryId: 'cart' },
    })
    expect(moment(target?.prefill?.startTime).format('HH:mm')).toBe('09:00')
  })

  it("can't invite to a Plan that follows someone else's invitation", () => {
    const linked = dayPlan('linked', {
      buddyShare: { from: 'mom', shareId: 's' },
    })
    // Inviting from a new Plan would count the morning twice.
    expect(joinRequestInvite(request, [linked], [])).toEqual({
      kind: 'linked',
      organizer: 'mom',
    })
    expect(findJoinRequestPlan(request, [linked], [])?.plan.id).toBe('linked')
  })

  it("offers no Invite when the owner's Plans that day changed and none match", () => {
    const moved = [
      dayPlan('ten', { startTimeInMinutes: 600 }),
      dayPlan('three', { startTimeInMinutes: 900 }),
    ]
    expect(joinRequestInvite(request, moved, [])).toEqual({ kind: 'changed' })
  })

  it('starts a new Plan when the owner no longer has one then', () => {
    const target = targetOf(joinRequestInvite(request, [], []))
    expect(target).toMatchObject({
      inviteBuddies: ['levi'],
      prefill: { minutes: 120 },
    })
    expect(moment(target?.prefill?.startTime).format('HH:mm')).toBe('09:00')
  })
})

describe('overlappingOwnPlans', () => {
  it('finds own one-time Plans that overlap the invitation in time', () => {
    const plans = [
      dayPlan('same'),
      dayPlan('overlaps', { startTimeInMinutes: 600, minutes: 60 }),
      dayPlan('after', { startTimeInMinutes: 660 }),
      dayPlan('other day', {
        date: normalizeDateForStorage('2026-10-09T12:00:00'),
      }),
      dayPlan('linked', { buddyShare: { from: 'anna', shareId: 's' } }),
      dayPlan('invites', { buddies: ['mom'] }),
    ]
    expect(
      overlappingOwnPlans({ d: thursday, ...nine }, plans).map((p) => p.id)
    ).toEqual(['same', 'overlaps'])
  })
})
