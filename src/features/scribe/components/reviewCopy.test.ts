import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({
  formatWeekdayMonthDayCompact: (day: moment.Moment) =>
    day.format('YYYY-MM-DD'),
  formatStartTime: (minutes: number) => `${minutes}@`,
}))
vi.mock('@/lib/minutes', () => ({
  formatMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))

import {
  cardWarnings,
  changeLine,
  choiceSummary,
  effectLines,
  fromSpoken,
  reviewDate,
} from '@/features/scribe/components/reviewCopy'
import type {
  ScribeEffect,
  ScribeEffectPreview,
  ScribeReviewCard,
  ScribeWarningCode,
} from '@/features/scribe/types'

const DAY = '2020-01-15'
const NO_SPOKEN = { date: null, time: null }

const effect = (
  preview: ScribeEffectPreview,
  warnings: ScribeWarningCode[] = []
): ScribeEffect => ({
  id: 'e1',
  kind: preview.kind,
  preview,
  warnings: warnings.map((code) => ({
    code,
    severity: code === 'plan_overlap' ? 'info' : 'warning',
  })),
  status: 'pending',
  skipReason: null,
})

const lines = (preview: ScribeEffectPreview, warnings?: ScribeWarningCode[]) =>
  effectLines(effect(preview, warnings), 'short')

describe('review card copy', () => {
  it('names today and tomorrow before the date', () => {
    const now = moment('2026-10-21 15:00', 'YYYY-MM-DD HH:mm')
    expect(reviewDate('2026-10-21', now)).toBe('today · 2026-10-21')
    expect(reviewDate('2026-10-22', now)).toBe('tomorrow · 2026-10-22')
    expect(reviewDate('2026-10-27', now)).toBe('2026-10-27')
  })

  it('quotes the phrase a value was worked out from', () => {
    expect(fromSpoken(null)).toBeNull()
    expect(fromSpoken(NO_SPOKEN)).toBeNull()
    expect(fromSpoken({ date: 'next Tuesday', time: null })).toBe(
      'scribe_fromSpoken {"phrase":"next Tuesday"}'
    )
    expect(fromSpoken({ date: 'Saturday', time: 'morning' })).toBe(
      'scribe_fromSpoken {"phrase":"Saturday morning"}'
    )
  })

  it('shows a change as before → after, with a dash for nothing', () => {
    expect(
      changeLine({ field: 'startMinutes', before: 540, after: 600 }, 'short')
    ).toBe(
      'scribe_cardChange {"field":"scribe_field_start","before":"540@","after":"600@"}'
    )
    expect(
      changeLine({ field: 'phone', before: null, after: '555-0100' }, 'short')
    ).toBe(
      'scribe_cardChange {"field":"scribe_field_phone","before":"—","after":"555-0100"}'
    )
  })

  it('describes time, with its category and a shared month marker', () => {
    const time = {
      kind: 'time.create' as const,
      date: DAY,
      minutes: 120,
      category: null,
      note: 'Cart',
      spoken: { date: 'yesterday', time: null },
    }
    expect(lines(time)).toEqual([
      {
        title: 'scribe_cardTime {"duration":"120m"}',
        meta: [DAY, 'Cart'],
        spoken: 'scribe_fromSpoken {"phrase":"yesterday"}',
      },
    ])
    expect(
      lines({ ...time, category: { name: 'LDC', credit: true } })[0].title
    ).toBe('scribe_cardTimeCategory {"duration":"120m","category":"LDC"}')
    expect(lines({ ...time, minutes: 0 }, ['shared_month'])[0].title).toBe(
      'scribe_cardSharedMonth'
    )
  })

  it('describes a plan at a time or anytime', () => {
    const plan = {
      kind: 'plan.create' as const,
      date: DAY,
      minutes: 120,
      startMinutes: 540,
      anytime: false,
      category: null,
      title: null,
      note: null,
      spoken: { date: 'Saturday', time: 'morning' },
      inviteNames: [],
    }
    expect(lines(plan)).toHaveLength(1)
    expect(lines(plan)[0]).toEqual({
      title: `scribe_cardPlanAt {"date":"${DAY}","time":"540@"}`,
      meta: ['120m'],
      spoken: 'scribe_fromSpoken {"phrase":"Saturday morning"}',
    })
    const anytime = lines({ ...plan, startMinutes: null, anytime: true })[0]
    expect(anytime.title).toBe(`scribe_cardPlan {"date":"${DAY}"}`)
    expect(anytime.meta).toEqual(['120m', 'scribe_cardPlanAnytime'])
  })

  it('says how to invite the buddies the User named for a plan', () => {
    const plan = {
      kind: 'plan.create' as const,
      date: DAY,
      minutes: 120,
      startMinutes: null,
      anytime: true,
      category: null,
      title: null,
      note: null,
      spoken: NO_SPOKEN,
      inviteNames: ['Sarah', 'Grace'],
    }
    expect(lines(plan)[1]).toEqual({
      title: 'scribe_cardPlanInvite {"names":"Sarah, Grace"}',
      meta: [],
      spoken: null,
    })
  })

  it('heads a plan or contact update and lists each change under it', () => {
    const change = { field: 'minutes' as const, before: 60, after: 90 }
    expect(
      lines({
        kind: 'plan.update',
        date: DAY,
        title: 'Cart',
        changes: [change],
        spoken: NO_SPOKEN,
      }).map((line) => line.title)
    ).toEqual([
      `scribe_cardPlanUpdate {"date":"${DAY}"}`,
      changeLine(change, 'short'),
    ])

    const phone = { field: 'phone' as const, before: null, after: '555-0100' }
    expect(
      lines({ kind: 'contact.update', name: 'Ana Ruiz', changes: [phone] }).map(
        (line) => line.title
      )
    ).toEqual([
      'scribe_cardContactUpdate {"name":"Ana Ruiz"}',
      changeLine(phone, 'short'),
    ])
  })

  it('heads a time change with the entry as it is, and names Standard', () => {
    const type = { field: 'category' as const, before: 'Bethel', after: null }
    expect(
      lines({
        kind: 'time.update',
        date: DAY,
        minutes: 60,
        category: { name: 'Bethel', credit: true },
        changes: [type],
        spoken: NO_SPOKEN,
      })
    ).toEqual([
      {
        title: `scribe_cardTimeUpdate {"date":"${DAY}"}`,
        meta: ['60m', 'Bethel'],
        spoken: null,
      },
      { title: changeLine(type, 'short'), meta: [], spoken: null },
    ])
    expect(changeLine(type, 'short')).toBe(
      'scribe_cardChange {"field":"scribe_field_type","before":"Bethel","after":"standard"}'
    )
  })

  it('says which entry a delete removes', () => {
    expect(
      lines({
        kind: 'time.delete',
        date: DAY,
        minutes: 90,
        category: null,
        note: 'Cart',
      })
    ).toEqual([
      {
        title: 'scribe_cardTimeDelete {"duration":"90m"}',
        meta: [DAY, 'Cart'],
        spoken: null,
      },
    ])
  })

  it('describes a new contact by its details', () => {
    expect(
      lines({
        kind: 'contact.create',
        name: 'Daniel Reyes',
        address: '42 Oak St',
        phone: null,
        email: 'd@example.com',
      })
    ).toEqual([
      {
        title: 'Daniel Reyes',
        meta: ['42 Oak St', 'd@example.com'],
        spoken: null,
      },
    ])
  })

  it('describes a visit and its follow-up', () => {
    const visit = {
      kind: 'visit.create' as const,
      date: DAY,
      notAtHome: false,
      bibleStudy: true,
      note: null,
      followUp: {
        date: '2020-01-21',
        topic: 'Hope for the future',
        spoken: { date: 'next Tuesday', time: null },
      },
      spoken: NO_SPOKEN,
    }
    expect(lines(visit)).toEqual([
      {
        title: 'scribe_cardVisit',
        meta: [DAY, 'scribe_cardBibleStudy'],
        spoken: null,
      },
      {
        title: 'scribe_cardFollowUp {"date":"2020-01-21"}',
        meta: ['Hope for the future'],
        spoken: 'scribe_fromSpoken {"phrase":"next Tuesday"}',
      },
    ])
    expect(lines({ ...visit, note: 'Psalm 37' })[0].title).toBe(
      'scribe_cardVisitNote {"note":"Psalm 37"}'
    )
    expect(lines({ ...visit, notAtHome: true, note: 'x' })[0].title).toBe(
      'scribe_cardNotAtHome'
    )
  })

  it('describes a new category and whether it counts', () => {
    expect(
      lines({ kind: 'category.create', name: 'LDC', credit: true })
    ).toEqual([
      {
        title: 'scribe_cardCategory {"name":"LDC"}',
        meta: ['scribe_cardCredit'],
        spoken: null,
      },
    ])
  })

  it("lists a card's warnings with their severity, but not the shared month marker", () => {
    const card = {
      effects: [
        effect(
          {
            kind: 'time.create',
            date: DAY,
            minutes: 60,
            category: null,
            note: null,
            spoken: NO_SPOKEN,
          },
          ['duplicate_time', 'shared_month', 'over_credit_cap', 'plan_overlap']
        ),
      ],
    } as ScribeReviewCard
    expect(cardWarnings(card)).toEqual([
      { text: 'scribe_warning_duplicateTime', severity: 'warning' },
      { text: 'scribe_warning_overCreditCap', severity: 'warning' },
      { text: 'scribe_warning_planOverlap', severity: 'info' },
    ])
  })

  it("sums up a choice card's visits", () => {
    const card = {
      effects: [
        effect({
          kind: 'visit.create',
          date: DAY,
          notAtHome: false,
          bibleStudy: true,
          note: null,
          followUp: null,
          spoken: NO_SPOKEN,
        }),
      ],
    } as ScribeReviewCard
    expect(choiceSummary(card, 'short')).toBe(
      `scribe_cardVisit · ${DAY} · scribe_cardBibleStudy`
    )
  })
})
