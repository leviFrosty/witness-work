import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('react-native', () => ({
  Share: { share: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('expo-clipboard', () => ({}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))
vi.mock('@/lib/appLifecycle', () => ({ addForegroundListener: vi.fn() }))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ timeDisplayFormat: 'decimal' }),
}))
vi.mock('@/stores/serviceReport', () => ({ default: {} }))
vi.mock('@/stores/categories', () => ({ default: {} }))
vi.mock('@/stores/conversationStore', () => ({ default: {} }))
vi.mock('@/stores/contactsStore', () => ({ default: {} }))
vi.mock('@/stores/profile', () => ({ useProfile: {} }))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({ useBuddies: {} }))
vi.mock('expo-image-manipulator', () => ({}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))

import moment from 'moment'
import {
  applyFormatRegion,
  formatCalendar,
  formatDate,
  formatDisplay,
  formatMonthDayCompact,
  formatRelative,
  formatTime,
} from '@/lib/dates'
import { loadMomentLocale, loadableMomentLocales } from '@/lib/momentLocales'
import { reportMonthKey } from '@/features/service-reports/lib/monthReportExport'
import { applyRollover } from '@/features/service-reports/lib/rollover'
import { followUpShareDetails } from '@/features/buddies/lib/shares'
import { buddyStreakCount } from '@/features/buddies/lib/buddyProfile'
import { buildCalendar } from '@/app/widgets/buildCalendar'

const ASCII = /^[\x20-\x7E]*$/
const ARABIC_DIGITS = /[٠-٩]/

describe('machine-read dates in Arabic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 14, 13, 30))
    applyFormatRegion({ language: 'ar' })
  })
  afterEach(() => {
    vi.useRealTimers()
    applyFormatRegion({ language: 'en' })
  })

  it("leave moment's own format() ASCII", () => {
    expect(moment.locale()).toBe('ar')
    expect(moment().format('YYYY-MM-DD')).toBe('2026-10-14')
    expect(moment().format('YYYY-MM')).toBe('2026-10')
    expect(moment().format()).toMatch(/^2026-10-14T13:30:00[+-]\d\d:\d\d$/)
    expect(moment().format('x')).toMatch(/^\d+$/)
  })

  it('still parse Arabic-Indic digits', () => {
    expect(moment('١٤/١٠/٢٠٢٦', 'D/M/YYYY').format('YYYY-MM-DD')).toBe(
      '2026-10-14'
    )
  })

  it('keep the report month key ASCII', () => {
    expect(reportMonthKey(9, 2026)).toBe('2026-10')
  })

  it('keep the rollover marker ASCII', () => {
    const application = applyRollover({
      serviceReports: {
        2026: {
          8: [
            {
              id: 'a',
              hours: 1,
              minutes: 30,
              date: new Date(2026, 8, 15, 12),
            },
          ],
        },
      },
      today: moment(),
      hasAnnualGoal: true,
      lastRolloverYearMonth: null,
      publisher: 'regularPioneer',
    })
    expect(application?.markerKey).toBe('2026-10')
  })

  it('keep the buddy share date ASCII', () => {
    const details = followUpShareDetails(
      { date: new Date(2026, 9, 20, 10), notifyMe: false },
      undefined
    )
    expect(details.d).toBe('2026-10-20')
  })

  it("compare a buddy's streak against an ASCII today", () => {
    expect(buddyStreakCount({ n: 8, until: '2026-10-14' })).toBe(8)
    expect(buddyStreakCount({ n: 8, until: '2026-10-13' })).toBe(0)
  })

  it('keep widget calendar dates ASCII', () => {
    const calendar = buildCalendar({
      serviceReports: {},
      dayPlans: [],
      recurringPlans: [],
      publisher: 'regularPioneer',
      logsHours: true,
      startOfWeek: 6,
      buddyMarkers: {},
    })
    expect(calendar.days.length).toBeGreaterThan(0)
    for (const day of calendar.days) expect(day.date).toMatch(ASCII)
    expect(calendar.days.some((day) => day.date === '2026-10-14')).toBe(true)
  })
})

describe('display helpers in Arabic', () => {
  beforeEach(() => applyFormatRegion({ language: 'ar', region: 'ar' }))
  afterEach(() => applyFormatRegion({ language: 'en' }))

  const sample = () => moment('2026-10-14T13:30:00')

  it('write Arabic-Indic digits and JW month names', () => {
    expect(formatDate(sample())).toBe('١٤ تشرين الأول (أكتوبر) ٢٠٢٦')
    expect(formatTime(sample())).toBe('١٣:٣٠')
    expect(formatMonthDayCompact(sample())).toBe('١٤ تشرين الأول')
    expect(formatDisplay(sample(), 'MMMM YYYY')).toBe(
      'تشرين الأول (أكتوبر) ٢٠٢٦'
    )
    expect(formatRelative(moment().subtract(3, 'days'))).toBe('منذ ٣ أيام')
    expect(formatCalendar(sample(), { referenceTime: sample() })).toMatch(
      ARABIC_DIGITS
    )
  })

  it('use the Arabic comma, as moment did', () => {
    expect(formatDisplay(sample(), 'dddd, D MMMM')).toBe(
      'الأربعاء، ١٤ تشرين الأول (أكتوبر)'
    )
  })

  it('leave Latin-digit Languages alone', () => {
    applyFormatRegion({ language: 'en', region: 'en' })
    expect(formatDisplay(sample(), 'MMMM D, YYYY')).toBe('October 14, 2026')
  })
})

describe('every moment locale the app loads', () => {
  it.each(loadableMomentLocales)('%s formats ASCII digits', (key) => {
    loadMomentLocale(key)
    expect(moment.localeData(key).postformat('0123456789, 10')).toBe(
      '0123456789, 10'
    )
    expect(moment('2026-10-14').locale(key).format('YYYY-MM-DD')).toBe(
      '2026-10-14'
    )
  })
})
