import { describe, expect, it } from 'vitest'
import { petVisitorsFor } from '@/app/pet/petVisitor'
import type {
  Buddy,
  IncomingShare,
  ReceivedReply,
} from '@/features/buddies/lib/state'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

const today = '2026-10-18'
const noonUtc = (key: string) => new Date(`${key}T12:00:00.000Z`)
const NOW = new Date('2026-10-18T08:00:00').getTime()

type VisitorBuddy = Pick<
  Buddy,
  'inboxId' | 'status' | 'pet' | 'name' | 'nickname' | 'overrides'
>
const anna: VisitorBuddy = {
  inboxId: 'anna',
  name: 'Anna Brooks',
  status: 'active',
  pet: { species: 'cat', coat: 'grey', name: 'Pip' },
}
const ben: VisitorBuddy = {
  inboxId: 'ben',
  name: 'Ben Ortiz',
  nickname: 'Benji',
  status: 'active',
  pet: { species: 'lamb', coat: 'default' },
}
const cara: VisitorBuddy = { inboxId: 'cara', name: 'Cara', status: 'active' }

const plan = (
  id: string,
  extra: Partial<DayPlan> & Pick<DayPlan, 'date'>
): DayPlan => ({ id, minutes: 60, ...extra })

const followUp = (
  id: string,
  at: string,
  buddies: string[],
  extra: Partial<NonNullable<Visit['followUp']>> = {}
): Pick<Visit, 'id' | 'followUp'> => ({
  id,
  followUp: { date: new Date(at), notifyMe: false, buddies, ...extra },
})

const invitation = (
  from: string,
  d: string,
  extra: Partial<IncomingShare> = {}
): IncomingShare => ({
  from,
  shareId: `share-${from}`,
  type: 'followUp',
  rev: 1,
  details: { d, s: 1080 },
  expiresAt: NOW + 86_400_000,
  receivedAt: NOW,
  status: 'going',
  ...extra,
})

const noReplies = () => undefined

const visitsFor = (
  input: Partial<Parameters<typeof petVisitorsFor>[0]>
): ReturnType<typeof petVisitorsFor> =>
  petVisitorsFor({
    buddies: [anna, ben, cara],
    dayPlans: [],
    visits: [],
    incomingShares: [],
    todayKey: today,
    now: NOW,
    repliesFor: noReplies,
    ...input,
  })

describe('petVisitorsFor', () => {
  it("brings every buddy with a pet on today's Plans, earliest first", () => {
    const visits = visitsFor({
      dayPlans: [
        plan('late', {
          date: noonUtc(today),
          startTimeInMinutes: 900,
          buddies: ['anna'],
        }),
        plan('early', {
          date: noonUtc(today),
          startTimeInMinutes: 540,
          buddies: ['cara', 'ben'],
        }),
      ],
    })
    expect(visits).toEqual([
      {
        inboxId: 'ben',
        buddyName: 'Benji',
        pet: ben.pet,
        startMinutes: 540,
        activity: { type: 'plan', planId: 'early' },
      },
      {
        inboxId: 'anna',
        buddyName: 'Anna Brooks',
        pet: anna.pet,
        startMinutes: 900,
        activity: { type: 'plan', planId: 'late' },
      },
    ])
  })

  it('brings each buddy once, from the first thing with them', () => {
    const visits = visitsFor({
      dayPlans: [
        plan('afternoon', {
          date: noonUtc(today),
          startTimeInMinutes: 840,
          buddies: ['anna'],
        }),
      ],
      visits: [followUp('rv', '2026-10-18T10:30:00', ['anna'])],
    })
    expect(visits).toHaveLength(1)
    expect(visits[0]).toMatchObject({
      inboxId: 'anna',
      startMinutes: 630,
      activity: { type: 'followUp', visitId: 'rv' },
    })
  })

  it('is nobody without anything today with a buddy who shares a pet', () => {
    expect(
      visitsFor({
        dayPlans: [
          plan('tomorrow', { date: noonUtc('2026-10-19'), buddies: ['anna'] }),
          plan('cara', { date: noonUtc(today), buddies: ['cara'] }),
        ],
        visits: [followUp('rv', '2026-10-19T10:00:00', ['ben'])],
        incomingShares: [invitation('anna', '2026-10-19')],
      })
    ).toEqual([])
  })

  it('leaves out buddies who declined, and keeps those going', () => {
    const declined: Record<string, ReceivedReply> = {
      anna: { status: 'declined', rev: 1, at: 1 },
      ben: { status: 'going', rev: 1, at: 1 },
    }
    const visits = visitsFor({
      dayPlans: [plan('p', { date: noonUtc(today), buddies: ['anna', 'ben'] })],
      visits: [followUp('rv', '2026-10-18T10:00:00', ['anna'])],
      repliesFor: (key) =>
        key === 'plan:p' || key === 'followUp:rv' ? declined : undefined,
    })
    expect(visits.map((visit) => visit.inboxId)).toEqual(['ben'])
  })

  it('counts the buddy whose Plan invitation the User answered', () => {
    expect(
      visitsFor({
        dayPlans: [
          plan('invited', {
            date: noonUtc(today),
            buddyShare: { from: 'anna', shareId: 's' },
            buddies: ['ben'],
          }),
        ],
      }).map((visit) => visit.inboxId)
    ).toEqual(['anna'])
  })

  it("counts a buddy's Follow-up the User is joining today", () => {
    expect(
      visitsFor({
        incomingShares: [
          invitation('anna', today),
          invitation('ben', today, { status: 'pending' }),
          invitation('cara', today),
        ],
      })
    ).toEqual([
      {
        inboxId: 'anna',
        buddyName: 'Anna Brooks',
        pet: anna.pet,
        startMinutes: 1080,
        activity: {
          type: 'followUpInvitation',
          from: 'anna',
          shareId: 'share-anna',
        },
      },
    ])
    expect(
      visitsFor({
        incomingShares: [invitation('anna', today, { expiresAt: NOW })],
      })
    ).toEqual([])
  })

  it("skips a dismissed Follow-up, and one that isn't a Follow-up", () => {
    expect(
      visitsFor({
        visits: [
          followUp('gone', '2026-10-18T10:00:00', ['anna'], {
            dismissed: true,
          }),
        ],
        incomingShares: [invitation('ben', today, { type: 'plan' })],
      })
    ).toEqual([])
  })

  it('leaves out buddies whose pets the User hid, and buddies not active', () => {
    const dayPlans = [
      plan('p', { date: noonUtc(today), buddies: ['anna', 'ben'] }),
    ]
    expect(
      visitsFor({
        dayPlans,
        showsPet: (buddy) => buddy.inboxId !== 'anna',
      }).map((visit) => visit.inboxId)
    ).toEqual(['ben'])
    expect(
      visitsFor({
        dayPlans,
        buddies: [{ ...anna, status: 'awaitingConfirm' }, ben],
      }).map((visit) => visit.inboxId)
    ).toEqual(['ben'])
  })

  it('draws a coat it doesn’t know in the species’ default', () => {
    expect(
      visitsFor({
        buddies: [{ ...anna, pet: { species: 'dog', coat: 'merle' } }],
        dayPlans: [plan('p', { date: noonUtc(today), buddies: ['anna'] })],
      })[0].pet
    ).toEqual({ species: 'dog', coat: 'gold' })
  })
})
