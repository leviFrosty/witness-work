import { describe, expect, it } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { DayPlan } from '@/types/timeEntry'
import {
  buildBuddyDayMarkers,
  stackedBuddies,
} from '@/features/buddies/lib/calendarMarkers'
import type {
  Buddy,
  IncomingShare,
  ReceivedCard,
} from '@/features/buddies/lib/state'

const today = '2026-10-04'
const now = Date.parse('2026-10-04T12:00:00Z')

const buddy = (inboxId: string, overrides: Partial<Buddy> = {}): Buddy => ({
  inboxId,
  name: inboxId,
  dhPub: '',
  inviteSecret: '',
  status: 'active',
  pairedAt: 0,
  colorIndex: 0,
  showOnCalendar: true,
  ...overrides,
})

const card = (...days: string[]): ReceivedCard => ({
  name: '',
  updatedAt: 0,
  receivedAt: 0,
  days: days.map((d) => ({ d, p: [{ m: 60 }] })),
})

const plan = (id: string, day: string, fields: Partial<DayPlan>): DayPlan => ({
  id,
  date: normalizeDateForStorage(`${day}T12:00:00`),
  minutes: 60,
  ...fields,
})

const followUp = (
  from: string,
  d: string,
  fields: Partial<IncomingShare> = {}
): IncomingShare => ({
  from,
  shareId: `${from}-${d}`,
  type: 'followUp',
  rev: 1,
  details: { d },
  expiresAt: now + 1000,
  receivedAt: now,
  status: 'going',
  ...fields,
})

const build = (
  input: Partial<Parameters<typeof buildBuddyDayMarkers>[0]>
): ReturnType<typeof buildBuddyDayMarkers> =>
  buildBuddyDayMarkers({
    buddies: [],
    cards: {},
    dayPlans: [],
    repliesFor: () => undefined,
    incomingShares: [],
    now,
    today,
    ...input,
  })

describe('buildBuddyDayMarkers', () => {
  it('puts invited buddies on the day, minus those who declined', () => {
    const sarah = buddy('sarah')
    const markers = build({
      buddies: [sarah, buddy('tom')],
      dayPlans: [plan('p', '2026-10-06', { buddies: ['sarah', 'tom'] })],
      repliesFor: () => ({ tom: { status: 'declined', rev: 1, at: 1 } }),
    })
    expect(markers['2026-10-06']).toEqual({
      withBuddies: [sarah],
      goingOut: [],
    })
  })

  it('leaves out a day whose only invitees all declined', () => {
    const markers = build({
      buddies: [buddy('sarah')],
      dayPlans: [plan('p', '2026-10-06', { buddies: ['sarah'] })],
      repliesFor: () => ({ sarah: { status: 'declined', rev: 1, at: 1 } }),
    })
    expect(markers).toEqual({})
  })

  it('merges the buddies of every Plan on a day, once each', () => {
    const sarah = buddy('sarah')
    const tom = buddy('tom')
    const markers = build({
      buddies: [sarah, tom],
      dayPlans: [
        plan('a', today, { buddies: ['sarah'] }),
        plan('b', today, { buddies: ['tom', 'sarah'] }),
      ],
    })
    expect(markers[today]?.withBuddies).toEqual([sarah, tom])
  })

  it('puts the inviter on a Plan that follows their invitation, even when hidden', () => {
    const grace = buddy('grace', { showOnCalendar: false })
    const markers = build({
      buddies: [grace],
      dayPlans: [
        plan('p', '2026-10-14', {
          buddyShare: { from: 'grace', shareId: 's' },
        }),
      ],
    })
    expect(markers['2026-10-14']?.withBuddies).toEqual([grace])
  })

  it('counts Follow-ups the User is joining, until they lapse', () => {
    const ann = buddy('ann')
    const markers = build({
      buddies: [ann],
      incomingShares: [
        followUp('ann', '2026-10-07'),
        followUp('ann', '2026-10-08', { status: 'declined' }),
        followUp('ann', '2026-10-09', { expiresAt: now }),
        followUp('ann', '2026-10-10', { type: 'plan' }),
      ],
    })
    expect(markers).toEqual({
      '2026-10-07': { withBuddies: [ann], goingOut: [] },
    })
  })

  it('lists other buddies going out, but not the ones the User is with', () => {
    const sarah = buddy('sarah')
    const tom = buddy('tom')
    const markers = build({
      buddies: [sarah, tom],
      cards: {
        sarah: card('2026-10-06', '2026-10-07'),
        tom: card('2026-10-06'),
      },
      dayPlans: [plan('p', '2026-10-06', { buddies: ['sarah'] })],
    })
    expect(markers['2026-10-06']).toEqual({
      withBuddies: [sarah],
      goingOut: [tom],
    })
    expect(markers['2026-10-07']).toEqual({
      withBuddies: [],
      goingOut: [sarah],
    })
  })

  it('keeps today but skips past days, empty days, and hidden or unconfirmed buddies', () => {
    const sarah = buddy('sarah')
    const markers = build({
      buddies: [
        sarah,
        buddy('tom', { showOnCalendar: false }),
        buddy('ann', { status: 'awaitingConfirm' }),
      ],
      cards: {
        sarah: {
          ...card('2026-10-03', today),
          days: [...card('2026-10-03', today).days, { d: '2026-10-05', p: [] }],
        },
        tom: card('2026-10-09'),
        ann: card('2026-10-09'),
      },
      dayPlans: [plan('p', '2026-10-01', { buddies: ['sarah'] })],
    })
    expect(markers).toEqual({ [today]: { withBuddies: [], goingOut: [sarah] } })
  })
})

describe('stackedBuddies', () => {
  const people = (count: number) =>
    Array.from({ length: count }, (_, i) => buddy(`b${i}`))

  it('shows everyone when three or fewer go out together', () => {
    expect(stackedBuddies(people(3))).toEqual({ shown: people(3), more: 0 })
  })

  it('shows two and counts the rest past three', () => {
    expect(stackedBuddies(people(5))).toEqual({
      shown: people(2),
      more: 3,
    })
  })
})
