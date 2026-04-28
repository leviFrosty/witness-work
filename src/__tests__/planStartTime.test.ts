import moment from 'moment'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  combineDateAndStartTime,
  formatStartTime,
  getStartTimeInMinutes,
  momentStoredDate,
  normalizeDateForStorage,
  splitDateAndStartTime,
} from '../lib/normalizeDate'
import {
  RecurringPlanFrequencies,
  getEffectiveStartTimeInMinutesForRecurringPlan,
} from '../lib/serviceReport'
import useServiceReport from '../stores/serviceReport'

vi.mock('../lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('../stores/mmkv', () => ({
  hasMigratedFromAsyncStorage: () => true,
  MmkvStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}))

const originalTZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

describe('getStartTimeInMinutes', () => {
  it('returns 720 (noon) when startTimeInMinutes is undefined — legacy plans render at noon without a migration', () => {
    expect(getStartTimeInMinutes({ startTimeInMinutes: undefined })).toBe(720)
    expect(DEFAULT_START_TIME_IN_MINUTES).toBe(720)
  })

  it('returns the explicit value when set, including the boundary 0', () => {
    expect(getStartTimeInMinutes({ startTimeInMinutes: 0 })).toBe(0)
    expect(getStartTimeInMinutes({ startTimeInMinutes: 540 })).toBe(540)
    expect(getStartTimeInMinutes({ startTimeInMinutes: 1439 })).toBe(1439)
  })
})

describe('splitDateAndStartTime / combineDateAndStartTime', () => {
  it('round-trips a local datetime through split → combine, preserving wall-clock time', () => {
    const local = new Date(2026, 3, 27, 9, 30, 0, 0) // Apr 27 2026 09:30 local
    const { date, startTimeInMinutes } = splitDateAndStartTime(local)

    expect(startTimeInMinutes).toBe(9 * 60 + 30)
    // The stored date is anchored at noon UTC on the local calendar day.
    expect(date.getUTCHours()).toBe(12)
    expect(momentStoredDate(date).format('YYYY-MM-DD')).toBe('2026-04-27')

    const combined = combineDateAndStartTime(date, startTimeInMinutes)
    expect(combined.getFullYear()).toBe(2026)
    expect(combined.getMonth()).toBe(3)
    expect(combined.getDate()).toBe(27)
    expect(combined.getHours()).toBe(9)
    expect(combined.getMinutes()).toBe(30)
  })

  it('combineDateAndStartTime falls back to noon when startTimeInMinutes is undefined', () => {
    const stored = normalizeDateForStorage(moment('2026-04-27').toDate())
    const combined = combineDateAndStartTime(stored, undefined)
    expect(combined.getHours()).toBe(12)
    expect(combined.getMinutes()).toBe(0)
  })
})

describe('formatStartTime', () => {
  it('produces a non-empty locale-aware string for a valid time', () => {
    const out = formatStartTime(540) // 9:00 AM
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
  })

  it('formats noon when given undefined (default)', () => {
    expect(formatStartTime(undefined)).toBe(formatStartTime(720))
  })
})

describe('getEffectiveStartTimeInMinutesForRecurringPlan', () => {
  const baseDate = normalizeDateForStorage(moment('2026-04-27').toDate())

  it('returns the override time when an override exists for the date', () => {
    const plan = {
      id: 'p1',
      startDate: baseDate,
      minutes: 60,
      startTimeInMinutes: 540, // 9:00 AM parent
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      overrides: [
        {
          date: baseDate,
          minutes: 90,
          startTimeInMinutes: 660, // 11:00 AM override
        },
      ],
    }
    expect(getEffectiveStartTimeInMinutesForRecurringPlan(plan, baseDate)).toBe(
      660
    )
  })

  it('falls back to the parent plan time when the override has no startTimeInMinutes', () => {
    const plan = {
      id: 'p2',
      startDate: baseDate,
      minutes: 60,
      startTimeInMinutes: 540,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
      overrides: [{ date: baseDate, minutes: 90 }],
    }
    expect(getEffectiveStartTimeInMinutesForRecurringPlan(plan, baseDate)).toBe(
      540
    )
  })

  it('falls back to noon when neither override nor plan has a time set', () => {
    const plan = {
      id: 'p3',
      startDate: baseDate,
      minutes: 60,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    }
    expect(getEffectiveStartTimeInMinutesForRecurringPlan(plan, baseDate)).toBe(
      720
    )
  })
})

describe('serviceReport store persists startTimeInMinutes', () => {
  beforeEach(() => {
    const state = useServiceReport.getState()
    state._WARNING_forceDeleteRecurringPlans()
    // dayPlans are kept across tests by default; clear via direct set.
    useServiceReport.setState({ dayPlans: [] })
  })

  it('addDayPlan persists startTimeInMinutes', () => {
    const { addDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'd1',
      date: moment('2026-04-27').toDate(),
      minutes: 90,
      startTimeInMinutes: 540,
    })
    const stored = useServiceReport
      .getState()
      .dayPlans.find((p) => p.id === 'd1')
    expect(stored?.startTimeInMinutes).toBe(540)
  })

  it('updateDayPlan persists startTimeInMinutes', () => {
    const { addDayPlan, updateDayPlan } = useServiceReport.getState()
    addDayPlan({
      id: 'd2',
      date: moment('2026-04-27').toDate(),
      minutes: 60,
    })
    updateDayPlan({ id: 'd2', startTimeInMinutes: 1020 })
    const stored = useServiceReport
      .getState()
      .dayPlans.find((p) => p.id === 'd2')
    expect(stored?.startTimeInMinutes).toBe(1020)
  })

  it('addRecurringPlan persists startTimeInMinutes', () => {
    const { addRecurringPlan } = useServiceReport.getState()
    addRecurringPlan({
      id: 'r1',
      startDate: moment('2026-04-27').toDate(),
      minutes: 90,
      startTimeInMinutes: 540,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })
    const stored = useServiceReport
      .getState()
      .recurringPlans.find((p) => p.id === 'r1')
    expect(stored?.startTimeInMinutes).toBe(540)
  })

  it('addRecurringPlanOverride persists startTimeInMinutes on the override', () => {
    const { addRecurringPlan, addRecurringPlanOverride } =
      useServiceReport.getState()
    addRecurringPlan({
      id: 'r2',
      startDate: moment('2026-04-27').toDate(),
      minutes: 90,
      startTimeInMinutes: 540,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })
    addRecurringPlanOverride('r2', {
      date: moment('2026-05-04').toDate(),
      minutes: 120,
      startTimeInMinutes: 660,
    })
    const stored = useServiceReport
      .getState()
      .recurringPlans.find((p) => p.id === 'r2')
    expect(stored?.overrides?.[0]?.startTimeInMinutes).toBe(660)
  })

  it('getRecurringPlanForDate exposes the override time when present, parent time otherwise', () => {
    const {
      addRecurringPlan,
      addRecurringPlanOverride,
      getRecurringPlanForDate,
    } = useServiceReport.getState()
    const planDate = moment('2026-04-27').toDate()
    const overrideDate = moment('2026-05-04').toDate()
    addRecurringPlan({
      id: 'r3',
      startDate: planDate,
      minutes: 90,
      startTimeInMinutes: 540,
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },
    })
    addRecurringPlanOverride('r3', {
      date: overrideDate,
      minutes: 120,
      startTimeInMinutes: 660,
    })

    const onParent = getRecurringPlanForDate('r3', planDate)
    expect(onParent?.startTimeInMinutes).toBe(540)

    const onOverride = getRecurringPlanForDate('r3', overrideDate)
    expect(onOverride?.startTimeInMinutes).toBe(660)
  })
})
