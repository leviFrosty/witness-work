import { describe, expect, it } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { Contact } from '@/types/contact'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import {
  buildOutgoingShares,
  planEndsAt,
  planShareDetails,
  sharedKeys,
  shareEndsAt,
  shareWithdrawnAt,
} from '@/features/buddies/lib/shares'

const plan: DayPlan = {
  id: 'anytime',
  date: normalizeDateForStorage(new Date(2026, 2, 10, 12)),
  minutes: 300,
  startTimeInMinutes: 720,
  anytime: true,
}

describe('sharing an anytime Plan', () => {
  it('sends no start time, so buddies on any version see no time', () => {
    expect(planShareDetails(plan)).not.toHaveProperty('s')
    expect(planShareDetails({ ...plan, anytime: undefined }).s).toBe(720)
  })

  it('lasts the whole day', () => {
    expect(planEndsAt(plan)).toBe(new Date(2026, 2, 11).getTime())
  })
})

describe('a share on every device of the User', () => {
  const now = new Date(2026, 2, 1).getTime()
  const shared: DayPlan = { ...plan, buddies: ['b'], updatedAt: now - 5 }
  const contact = { id: 'c1', name: 'Maria', updatedAt: now - 3 } as Contact
  const visit = {
    id: 'v1',
    contact: { id: 'c1' },
    updatedAt: now - 9,
    followUp: { date: new Date(2026, 2, 3), notifyMe: false, buddies: ['b'] },
  } as Visit

  it('is versioned by when its Plan, or its Follow-up and Contact, last changed', () => {
    const specs = buildOutgoingShares({
      dayPlans: [shared, { ...shared, id: 'legacy', updatedAt: undefined }],
      visits: [visit],
      contacts: [contact],
      now,
    })
    expect(specs.map((spec) => [spec.key, spec.version])).toEqual([
      ['plan:anytime', now - 5],
      ['plan:legacy', undefined],
      ['followUp:v1', now - 3],
    ])
  })

  it('lists the keys of Plans and Follow-ups that invite buddies', () => {
    expect([
      ...sharedKeys(
        [
          shared,
          { ...plan, id: 'solo' },
          { ...shared, id: 'linked', buddyShare: { from: 'x', shareId: 'y' } },
        ],
        [
          visit,
          {
            ...visit,
            id: 'v2',
            followUp: { ...visit.followUp!, dismissed: true },
          },
        ]
      ),
    ]).toEqual(['plan:anytime', 'followUp:v1'])
  })

  it('stops being shared at its deletion, or the change that took buddies off', () => {
    const data = {
      dayPlans: [{ ...plan, updatedAt: now - 1 }],
      deletedDayPlans: [{ id: 'gone', deletedAt: now - 2 }],
      visits: [visit],
      deletedVisits: [{ id: 'v9', deletedAt: now - 4 }],
    }
    expect(shareWithdrawnAt('plan:anytime', data)).toBe(now - 1)
    expect(shareWithdrawnAt('plan:gone', data)).toBe(now - 2)
    expect(shareWithdrawnAt('followUp:v1', data)).toBe(now - 9)
    expect(shareWithdrawnAt('followUp:v9', data)).toBe(now - 4)
    expect(shareWithdrawnAt('plan:unknown', data)).toBeUndefined()
  })

  it('ends with its Plan or Follow-up while the User has it, invitees or not', () => {
    const data = {
      dayPlans: [
        { ...plan, buddies: undefined },
        { ...shared, id: 'linked', buddyShare: { from: 'x', shareId: 'y' } },
      ],
      visits: [
        { ...visit, followUp: { ...visit.followUp!, buddies: undefined } },
        {
          ...visit,
          id: 'v2',
          followUp: { ...visit.followUp!, dismissed: true },
        },
      ],
    }
    expect(shareEndsAt('plan:anytime', data)).toBe(planEndsAt(plan))
    expect(shareEndsAt('followUp:v1', data)).toBe(
      new Date(2026, 2, 3).getTime()
    )

    expect(shareEndsAt('plan:deleted', data)).toBeUndefined()
    expect(shareEndsAt('plan:linked', data)).toBeUndefined()
    expect(shareEndsAt('followUp:v2', data)).toBeUndefined()
  })
})
