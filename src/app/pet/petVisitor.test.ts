import { describe, expect, it } from 'vitest'
import { petVisitorFor } from '@/app/pet/petVisitor'
import type { Buddy, ReceivedReply } from '@/features/buddies/lib/state'
import type { DayPlan } from '@/types/timeEntry'

const today = '2026-10-18'
const noonUtc = (key: string) => new Date(`${key}T12:00:00.000Z`)

type VisitorBuddy = Pick<Buddy, 'inboxId' | 'status' | 'pet'>
const anna: VisitorBuddy = {
  inboxId: 'anna',
  status: 'active',
  pet: { species: 'cat', coat: 'grey', name: 'Pip' },
}
const ben: VisitorBuddy = {
  inboxId: 'ben',
  status: 'active',
  pet: { species: 'lamb', coat: 'default' },
}
const cara: VisitorBuddy = { inboxId: 'cara', status: 'active' }

const plan = (
  id: string,
  extra: Partial<DayPlan> & Pick<DayPlan, 'date'>
): DayPlan => ({ id, minutes: 60, ...extra })

const noReplies = () => undefined

describe('petVisitorFor', () => {
  it("is the pet of a buddy on today's earliest Plan", () => {
    expect(
      petVisitorFor({
        buddies: [anna, ben, cara],
        todayKey: today,
        repliesFor: noReplies,
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
    ).toEqual(ben.pet)
  })

  it('is nobody without a Plan today with a buddy who shares a pet', () => {
    const tomorrow = plan('tomorrow', {
      date: noonUtc('2026-10-19'),
      buddies: ['anna'],
    })
    const withCara = plan('cara', { date: noonUtc(today), buddies: ['cara'] })
    expect(
      petVisitorFor({
        buddies: [anna, cara],
        todayKey: today,
        repliesFor: noReplies,
        dayPlans: [tomorrow, withCara],
      })
    ).toBeNull()
    expect(
      petVisitorFor({
        buddies: [cara],
        todayKey: today,
        repliesFor: noReplies,
        dayPlans: [plan('p', { date: noonUtc(today), buddies: ['cara'] })],
      })
    ).toBeNull()
  })

  it('leaves out buddies who declined, and buddies not active', () => {
    const declined: Record<string, ReceivedReply> = {
      anna: { status: 'declined', rev: 1, at: 1 },
    }
    const shared = plan('shared', {
      date: noonUtc(today),
      buddies: ['anna', 'ben'],
    })
    expect(
      petVisitorFor({
        buddies: [anna, ben],
        todayKey: today,
        repliesFor: (p) => (p.id === 'shared' ? declined : undefined),
        dayPlans: [shared],
      })
    ).toEqual(ben.pet)
    expect(
      petVisitorFor({
        buddies: [anna, { ...ben, status: 'awaitingConfirm' }],
        todayKey: today,
        repliesFor: () => declined,
        dayPlans: [shared],
      })
    ).toBeNull()
    // Going still counts.
    expect(
      petVisitorFor({
        buddies: [anna],
        todayKey: today,
        repliesFor: () => ({ anna: { status: 'going', rev: 1, at: 1 } }),
        dayPlans: [shared],
      })
    ).toEqual(anna.pet)
  })

  it('counts the buddy whose invitation the User answered', () => {
    expect(
      petVisitorFor({
        buddies: [anna],
        todayKey: today,
        repliesFor: noReplies,
        dayPlans: [
          plan('invited', {
            date: noonUtc(today),
            buddyShare: { from: 'anna', shareId: 's' },
          }),
        ],
      })
    ).toEqual(anna.pet)
  })

  it('draws a coat it doesn’t know in the species’ default', () => {
    expect(
      petVisitorFor({
        buddies: [{ ...anna, pet: { species: 'dog', coat: 'merle' } }],
        todayKey: today,
        repliesFor: noReplies,
        dayPlans: [plan('p', { date: noonUtc(today), buddies: ['anna'] })],
      })
    ).toEqual({ species: 'dog', coat: 'gold' })
  })
})
