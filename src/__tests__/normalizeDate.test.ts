import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import moment from 'moment'
import {
  momentStoredDate,
  normalizeDateForStorage,
  normalizePartialRecurringPlan,
  normalizeRecurringPlan,
  preserveOrNormalizeStoredDate,
} from '@/lib/normalizeDate'
import { RecurringPlan, RecurringPlanFrequencies } from '@/lib/serviceReport'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const originalTZ = process.env.TZ

const setTZ = (tz: string) => {
  process.env.TZ = tz
}

beforeAll(() => {
  setTZ('America/Los_Angeles')
})

afterAll(() => {
  if (originalTZ === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = originalTZ
  }
})

describe('normalizeDateForStorage', () => {
  it('returns a Date anchored at exactly 12:00:00.000 UTC', () => {
    const input = moment('2026-05-01').toDate()
    const normalized = normalizeDateForStorage(input)

    expect(normalized.getUTCHours()).toBe(12)
    expect(normalized.getUTCMinutes()).toBe(0)
    expect(normalized.getUTCSeconds()).toBe(0)
    expect(normalized.getUTCMilliseconds()).toBe(0)
  })

  it('preserves the author-local calendar day in UTC components, stable across TZ changes', () => {
    setTZ('America/Los_Angeles')
    const authoredInPST = moment('2026-05-01').toDate()
    const normalized = normalizeDateForStorage(authoredInPST)

    const tzs = [
      'Etc/GMT+12',
      'Pacific/Honolulu',
      'America/Los_Angeles',
      'America/New_York',
      'UTC',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Pacific/Auckland',
      'Pacific/Apia',
      'Pacific/Kiritimati',
    ]
    for (const tz of tzs) {
      setTZ(tz)
      const m = moment.utc(normalized)
      expect({ tz, y: m.year(), mo: m.month(), d: m.date() }).toEqual({
        tz,
        y: 2026,
        mo: 4,
        d: 1,
      })
    }
  })

  it('is idempotent in the same TZ', () => {
    setTZ('America/Los_Angeles')
    const once = normalizeDateForStorage(moment('2026-05-01').toDate())
    const twice = normalizeDateForStorage(once)
    const thrice = normalizeDateForStorage(twice)

    expect(once.getTime()).toBe(twice.getTime())
    expect(twice.getTime()).toBe(thrice.getTime())
  })

  it('is NOT idempotent across TZ changes when the input is interpreted as fresh local input (by design — see preserveOrNormalizeStoredDate)', () => {
    setTZ('America/Los_Angeles')
    const once = normalizeDateForStorage(moment('2026-05-01').toDate())
    setTZ('Pacific/Auckland')
    const twice = normalizeDateForStorage(once)

    expect(momentStoredDate(twice).format('YYYY-MM-DD')).toBe('2026-05-02')
  })
})

describe('preserveOrNormalizeStoredDate', () => {
  it('preserves an already-anchored noon-UTC Date verbatim across TZ changes', () => {
    setTZ('America/Los_Angeles')
    const stored = normalizeDateForStorage(moment('2026-05-01').toDate())

    const tzs = [
      'Pacific/Honolulu',
      'America/Los_Angeles',
      'America/New_York',
      'UTC',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Pacific/Auckland',
      'Pacific/Apia',
      'Pacific/Kiritimati',
    ]
    for (const tz of tzs) {
      setTZ(tz)
      const out = preserveOrNormalizeStoredDate(stored)
      expect({ tz, ms: out.getTime() }).toEqual({
        tz,
        ms: stored.getTime(),
      })
    }
  })

  it('falls through to local extraction for non-anchored (pre-fix) inputs', () => {
    setTZ('America/Los_Angeles')

    const preFix = moment('2026-05-01').toDate()
    expect(preFix.getUTCHours()).not.toBe(12)
    const out = preserveOrNormalizeStoredDate(preFix)
    expect(out.getUTCHours()).toBe(12)
    expect(momentStoredDate(out).format('YYYY-MM-DD')).toBe('2026-05-01')
  })
})

describe('momentStoredDate', () => {
  afterEach(() => {
    setTZ('America/Los_Angeles')
  })

  it('reads an anchored value by its UTC calendar day in every TZ', () => {
    setTZ('America/Los_Angeles')
    const stored = normalizeDateForStorage(moment('2026-08-31').toDate())
    const tzs = [
      'Etc/GMT+12',
      'America/New_York',
      'UTC',
      'Asia/Tokyo',
      'Pacific/Kiritimati',
    ]
    for (const tz of tzs) {
      setTZ(tz)
      expect({
        tz,
        day: momentStoredDate(stored).format('YYYY-MM-DD'),
      }).toEqual({
        tz,
        day: '2026-08-31',
      })
    }
  })

  it('reads an un-anchored instant as the local calendar day it falls on, not its UTC day', () => {
    const lateEveningWest = new Date('2026-09-01T03:29:00.000Z')
    setTZ('America/New_York')
    expect(momentStoredDate(lateEveningWest).format('YYYY-MM-DD')).toBe(
      '2026-08-31'
    )
    setTZ('UTC')
    expect(momentStoredDate(lateEveningWest).format('YYYY-MM-DD')).toBe(
      '2026-09-01'
    )

    const earlyMorningEast = new Date('2026-08-31T20:30:00.000Z')
    setTZ('Asia/Tokyo')
    expect(momentStoredDate(earlyMorningEast).format('YYYY-MM-DD')).toBe(
      '2026-09-01'
    )
    setTZ('UTC')
    expect(momentStoredDate(earlyMorningEast).format('YYYY-MM-DD')).toBe(
      '2026-08-31'
    )
  })

  it('agrees with the day the write path would have stored for an un-anchored instant', () => {
    const instant = new Date('2026-09-01T03:29:00.000Z')
    const tzs = [
      'Etc/GMT+12',
      'America/New_York',
      'UTC',
      'Asia/Tokyo',
      'Pacific/Kiritimati',
    ]
    for (const tz of tzs) {
      setTZ(tz)
      expect({
        tz,
        day: momentStoredDate(instant).format('YYYY-MM-DD'),
      }).toEqual({
        tz,
        day: momentStoredDate(normalizeDateForStorage(instant)).format(
          'YYYY-MM-DD'
        ),
      })
    }
  })
})

describe('original bug repro: plans/reports moving on TZ change', () => {
  it('keeps a May 1 plan authored in JST as May 1 after the device switches to PST', () => {
    setTZ('Asia/Tokyo')
    const authoredInJST = moment('2026-05-01').toDate()
    const stored = normalizeDateForStorage(authoredInJST)

    setTZ('America/Los_Angeles')
    const m = momentStoredDate(stored)
    expect({ y: m.year(), mo: m.month(), d: m.date() }).toEqual({
      y: 2026,
      mo: 4,
      d: 1,
    })
  })

  it('keeps a March 1 plan authored in PST as March 1 after the device switches to JST', () => {
    setTZ('America/Los_Angeles')
    const authoredInPST = moment('2026-03-01').toDate()
    const stored = normalizeDateForStorage(authoredInPST)

    setTZ('Asia/Tokyo')
    const m = momentStoredDate(stored)
    expect({ y: m.year(), mo: m.month(), d: m.date() }).toEqual({
      y: 2026,
      mo: 2,
      d: 1,
    })
  })

  it('keeps year boundary intact (Jan 1 in JST stays Jan 1 in PST)', () => {
    setTZ('Asia/Tokyo')
    const newYearsInJST = moment('2026-01-01').toDate()
    const stored = normalizeDateForStorage(newYearsInJST)

    setTZ('America/Los_Angeles')
    const m = momentStoredDate(stored)
    expect({ y: m.year(), mo: m.month(), d: m.date() }).toEqual({
      y: 2026,
      mo: 0,
      d: 1,
    })
  })
})

const basePlan = (overrides: Partial<RecurringPlan> = {}): RecurringPlan => ({
  id: 'plan-1',
  startDate: moment('2026-05-01').toDate(),
  minutes: 60,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
  ...overrides,
})

describe('normalizeRecurringPlan', () => {
  beforeAll(() => setTZ('America/Los_Angeles'))

  it('normalizes startDate to noon UTC', () => {
    const plan = basePlan()
    const out = normalizeRecurringPlan(plan)
    expect(out.startDate.getUTCHours()).toBe(12)
    expect(momentStoredDate(out.startDate).format('YYYY-MM-DD')).toBe(
      '2026-05-01'
    )
  })

  it('normalizes recurrence.endDate when present', () => {
    const plan = basePlan({
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: moment('2026-12-31').toDate(),
      },
    })
    const out = normalizeRecurringPlan(plan)
    expect(out.recurrence.endDate?.getUTCHours()).toBe(12)
    expect(
      momentStoredDate(out.recurrence.endDate as Date).format('YYYY-MM-DD')
    ).toBe('2026-12-31')
  })

  it('preserves recurrence.endDate as null when null', () => {
    const plan = basePlan()
    const out = normalizeRecurringPlan(plan)
    expect(out.recurrence.endDate).toBeNull()
  })

  it('normalizes every entry in deletedDates and preserves order', () => {
    const plan = basePlan({
      deletedDates: [
        moment('2026-05-15').toDate(),
        moment('2026-05-22').toDate(),
        new Date('2026-05-29T22:30:00.000Z'),
      ],
    })
    const out = normalizeRecurringPlan(plan)
    expect(out.deletedDates).toHaveLength(3)
    expect(out.deletedDates?.map((d) => d.getUTCHours())).toEqual([12, 12, 12])
    expect(
      out.deletedDates?.map((d) => momentStoredDate(d).format('YYYY-MM-DD'))
    ).toEqual(['2026-05-15', '2026-05-22', '2026-05-29'])
  })

  it('preserves deletedDates as undefined when undefined (no empty-array drift)', () => {
    const out = normalizeRecurringPlan(basePlan())
    expect(out.deletedDates).toBeUndefined()
  })

  it("normalizes each override's date and preserves the non-date fields verbatim", () => {
    const plan = basePlan({
      overrides: [
        {
          date: moment('2026-05-08').toDate(),
          minutes: 90,
          note: 'extended visit',
        },
        {
          date: new Date('2026-05-15T22:30:00.000Z'),
          minutes: 30,
        },
      ],
    })
    const out = normalizeRecurringPlan(plan)
    expect(out.overrides).toHaveLength(2)
    expect(out.overrides![0].date.getUTCHours()).toBe(12)
    expect(momentStoredDate(out.overrides![0].date).format('YYYY-MM-DD')).toBe(
      '2026-05-08'
    )
    expect(out.overrides![0].minutes).toBe(90)
    expect(out.overrides![0].note).toBe('extended visit')

    expect(momentStoredDate(out.overrides![1].date).format('YYYY-MM-DD')).toBe(
      '2026-05-15'
    )
    expect(out.overrides![1].minutes).toBe(30)
    expect(out.overrides![1].note).toBeUndefined()
  })

  it('preserves overrides as undefined when undefined', () => {
    const out = normalizeRecurringPlan(basePlan())
    expect(out.overrides).toBeUndefined()
  })

  it('preserves non-date fields, including monthlyByWeekdayConfig and updatedAt', () => {
    const plan = basePlan({
      id: 'rp-special',
      minutes: 120,
      note: 'meeting prep',
      updatedAt: 1735689600000,
      recurrence: {
        frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
        interval: 2,
        endDate: null,
        monthlyByWeekdayConfig: { weekday: 1, weekOfMonth: 2 },
      },
    })
    const out = normalizeRecurringPlan(plan)

    expect(out.id).toBe('rp-special')
    expect(out.minutes).toBe(120)
    expect(out.note).toBe('meeting prep')
    expect(out.updatedAt).toBe(1735689600000)
    expect(out.recurrence.frequency).toBe(
      RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY
    )
    expect(out.recurrence.interval).toBe(2)
    expect(out.recurrence.monthlyByWeekdayConfig).toEqual({
      weekday: 1,
      weekOfMonth: 2,
    })
  })

  it('is idempotent', () => {
    const once = normalizeRecurringPlan(
      basePlan({
        recurrence: {
          frequency: RecurringPlanFrequencies.WEEKLY,
          interval: 1,
          endDate: moment('2026-12-31').toDate(),
        },
        deletedDates: [moment('2026-05-15').toDate()],
        overrides: [{ date: moment('2026-05-08').toDate(), minutes: 90 }],
      })
    )
    const twice = normalizeRecurringPlan(once)
    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once))
  })

  it('locks in the author-local calendar day; subsequent reads in any TZ see the same Y-M-D', () => {
    setTZ('Asia/Tokyo')
    const planJST: RecurringPlan = basePlan({
      startDate: moment('2026-05-01').toDate(),
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: moment('2026-12-31').toDate(),
      },
      deletedDates: [moment('2026-05-15').toDate()],
      overrides: [{ date: moment('2026-05-08').toDate(), minutes: 90 }],
    })
    const stored = normalizeRecurringPlan(planJST)

    const dayKeys = (p: RecurringPlan) => ({
      start: momentStoredDate(p.startDate).format('YYYY-MM-DD'),
      end: momentStoredDate(p.recurrence.endDate as Date).format('YYYY-MM-DD'),
      deleted: p.deletedDates?.map((d) =>
        momentStoredDate(d).format('YYYY-MM-DD')
      ),
      overrides: p.overrides?.map((o) =>
        momentStoredDate(o.date).format('YYYY-MM-DD')
      ),
    })
    const expected = {
      start: '2026-05-01',
      end: '2026-12-31',
      deleted: ['2026-05-15'],
      overrides: ['2026-05-08'],
    }

    for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
      setTZ(tz)
      expect(dayKeys(stored)).toEqual(expected)
    }
  })
})

describe('normalizePartialRecurringPlan', () => {
  beforeAll(() => setTZ('America/Los_Angeles'))

  it('returns an empty-shape passthrough when given an empty object', () => {
    const out = normalizePartialRecurringPlan({})
    expect(out).toEqual({})
  })

  it('preserves an id-only update without inventing date fields', () => {
    const out = normalizePartialRecurringPlan({ id: 'rp-1', minutes: 90 })
    expect(out).toEqual({ id: 'rp-1', minutes: 90 })
    expect('startDate' in out).toBe(false)
    expect('recurrence' in out).toBe(false)
    expect('deletedDates' in out).toBe(false)
    expect('overrides' in out).toBe(false)
  })

  it('normalizes only startDate when only startDate is present', () => {
    const out = normalizePartialRecurringPlan({
      id: 'rp-1',
      startDate: moment('2026-05-01').toDate(),
    })
    expect(out.startDate?.getUTCHours()).toBe(12)
    expect(momentStoredDate(out.startDate as Date).format('YYYY-MM-DD')).toBe(
      '2026-05-01'
    )
    expect('recurrence' in out).toBe(false)
  })

  it('normalizes recurrence.endDate when recurrence is present', () => {
    const out = normalizePartialRecurringPlan({
      id: 'rp-1',
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: moment('2026-12-31').toDate(),
      },
    })
    expect(out.recurrence?.endDate?.getUTCHours()).toBe(12)
    expect(
      momentStoredDate(out.recurrence?.endDate as Date).format('YYYY-MM-DD')
    ).toBe('2026-12-31')
  })

  it('preserves null endDate inside recurrence', () => {
    const out = normalizePartialRecurringPlan({
      id: 'rp-1',
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })
    expect(out.recurrence?.endDate).toBeNull()
  })

  it('normalizes deletedDates only when present', () => {
    const out = normalizePartialRecurringPlan({
      id: 'rp-1',
      deletedDates: [moment('2026-05-15').toDate()],
    })
    expect(out.deletedDates?.[0].getUTCHours()).toBe(12)
    expect(momentStoredDate(out.deletedDates![0]).format('YYYY-MM-DD')).toBe(
      '2026-05-15'
    )
  })

  it('normalizes overrides only when present, preserving notes and minutes', () => {
    const out = normalizePartialRecurringPlan({
      id: 'rp-1',
      overrides: [
        { date: moment('2026-05-08').toDate(), minutes: 90, note: 'extended' },
      ],
    })
    expect(out.overrides).toHaveLength(1)
    expect(momentStoredDate(out.overrides![0].date).format('YYYY-MM-DD')).toBe(
      '2026-05-08'
    )
    expect(out.overrides![0].minutes).toBe(90)
    expect(out.overrides![0].note).toBe('extended')
  })
})
