import { describe, expect, it } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import { followUpShareKey, planShareKey } from '@/features/buddies/lib/shares'
import type { IncomingShare } from '@/features/buddies/lib/state'
import { buildTogether } from '@/features/buddies/lib/together'

const today = new Date(2026, 9, 5, 9)

const dayPlan = (id: string, date: string, extra?: Partial<DayPlan>) =>
  ({
    id,
    date: normalizeDateForStorage(date),
    minutes: 60,
    ...extra,
  }) as DayPlan

const incoming = (
  shareId: string,
  d: string,
  status: IncomingShare['status'],
  from = 'maria'
): IncomingShare => ({
  from,
  shareId,
  type: 'plan',
  rev: 1,
  details: { d, s: 540, m: 120 },
  expiresAt: Number.MAX_SAFE_INTEGER,
  receivedAt: 0,
  status,
})

const followUpVisit = (id: string, date: Date, buddies: string[]) =>
  ({
    id,
    contact: { id: 'c1' },
    date,
    isBibleStudy: false,
    followUp: { date, notifyMe: false, buddies },
  }) as Visit

const build = (input: Partial<Parameters<typeof buildTogether>[0]>) =>
  buildTogether({
    inboxId: 'maria',
    incomingShares: {},
    dayPlans: [],
    visits: [],
    contacts: [],
    replyFor: () => undefined,
    today,
    ...input,
  })

describe('buildTogether', () => {
  it('splits unanswered invitations from answered ones', () => {
    const { needsAnswer, together } = build({
      incomingShares: {
        'maria|a': incoming('a', '2026-10-08', 'pending'),
        'maria|b': incoming('b', '2026-10-07', 'declined'),
        'maria|c': incoming('c', '2026-10-09', 'cancelled'),
        'anna|d': incoming('d', '2026-10-09', 'pending', 'anna'),
        'maria|e': incoming('e', '2026-10-01', 'pending'),
      },
    })
    expect(needsAnswer.map((item) => item.key)).toEqual(['in:maria|a'])
    expect(together.map((item) => item.key)).toEqual(['in:maria|b'])
  })

  it('counts an invitation answered on another device as going', () => {
    const { needsAnswer, together } = build({
      incomingShares: { 'maria|a': incoming('a', '2026-10-08', 'pending') },
      dayPlans: [
        dayPlan('linked', '2026-10-08', {
          buddyShare: { from: 'maria', shareId: 'a' },
        }),
      ],
    })
    expect(needsAnswer).toEqual([])
    expect(together[0]).toMatchObject({ status: 'going', planId: 'linked' })
  })

  it("lists this User's upcoming invitations to the buddy, soonest first", () => {
    const followUpDate = new Date(2026, 9, 6, 10)
    const { together } = build({
      dayPlans: [
        dayPlan('later', '2026-10-10', { buddies: ['maria'] }),
        dayPlan('past', '2026-10-01', { buddies: ['maria'] }),
        dayPlan('other', '2026-10-07', { buddies: ['anna'] }),
        dayPlan('soon', '2026-10-05', {
          buddies: ['maria'],
          startTimeInMinutes: 600,
        }),
      ],
      visits: [
        followUpVisit('v1', followUpDate, ['maria']),
        followUpVisit('v2', new Date(2026, 9, 1), ['maria']),
      ],
      contacts: [{ id: 'c1', name: 'John Smith' }],
      replyFor: (key) =>
        key === planShareKey('later')
          ? { status: 'going', rev: 1, at: 0 }
          : key === followUpShareKey('v1')
            ? { status: 'declined', rev: 1, at: 0 }
            : undefined,
    })
    expect(
      together.map((item) => [item.key, item.status, item.direction])
    ).toEqual([
      ['plan:soon', 'invited', 'outgoing'],
      ['followUp:v1', 'declined', 'outgoing'],
      ['plan:later', 'going', 'outgoing'],
    ])
    expect(together[1].details.firstName).toBe('John')
  })
})
