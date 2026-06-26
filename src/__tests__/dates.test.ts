import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mutable device state the mocked expo-localization reads from.
const device = {
  languageTag: 'en-US',
  uses24hourClock: false as boolean | null,
  firstWeekday: 1 as number | null, // expo Weekday enum: SUNDAY = 1
}

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: device.languageTag }],
  getCalendars: () => [
    {
      uses24hourClock: device.uses24hourClock,
      firstWeekday: device.firstWeekday,
    },
  ],
}))

import moment from 'moment'
import 'moment/locale/en-au'
import 'moment/locale/en-gb'
import 'moment/locale/es'
import 'moment/locale/ja'
import {
  applyFormatRegion,
  formatCalendar,
  formatDate,
  formatDateTime,
  formatMonthDayCompact,
  formatRelative,
  formatStartTime,
  formatTime,
  formatWeekdayMonthDayCompact,
  getDateOrderFromPattern,
  getPristineLongDateFormat,
  reorderNumericPattern,
  resolveDateOrder,
  resolveStartOfWeek,
  resolveTimeFormat,
} from '@/lib/dates'

// Factory, not a constant: moment instances capture the global locale at
// creation, and importing locale files above moved it. Each test wants the
// locale applyFormatRegion just configured.
const sample = () => moment('2026-06-11T13:30:00') // Thursday

beforeEach(() => {
  device.languageTag = 'en-US'
  device.uses24hourClock = false
  device.firstWeekday = 1
  // Restore a clean US-English baseline between tests.
  applyFormatRegion({ language: 'en' })
})

describe('getDateOrderFromPattern', () => {
  it('classifies the common numeric patterns', () => {
    expect(getDateOrderFromPattern('MM/DD/YYYY')).toBe('mdy')
    expect(getDateOrderFromPattern('DD/MM/YYYY')).toBe('dmy')
    expect(getDateOrderFromPattern('D.M.YYYY')).toBe('dmy')
    expect(getDateOrderFromPattern('YYYY/MM/DD')).toBe('ymd')
    expect(getDateOrderFromPattern('YYYY.MM.DD.')).toBe('ymd')
  })
})

describe('reorderNumericPattern', () => {
  it('reorders while preserving token widths and separators', () => {
    expect(reorderNumericPattern('MM/DD/YYYY', 'dmy')).toBe('DD/MM/YYYY')
    expect(reorderNumericPattern('DD.MM.YYYY', 'ymd')).toBe('YYYY.MM.DD')
    expect(reorderNumericPattern('D/M/YYYY', 'mdy')).toBe('M/D/YYYY')
    expect(reorderNumericPattern('MM/DD/YYYY', 'mdy')).toBe('MM/DD/YYYY')
  })

  it('leaves non-three-part patterns untouched', () => {
    expect(reorderNumericPattern('MM/YYYY', 'dmy')).toBe('MM/YYYY')
    expect(reorderNumericPattern('LL', 'dmy')).toBe('LL')
  })
})

describe('applyFormatRegion', () => {
  it('overlays the Region date order onto the language locale', () => {
    applyFormatRegion({ language: 'en', region: 'en-au' })
    expect(sample().format('L')).toBe('11/06/2026')
  })

  it('keeps month/weekday names from the language, not the Region', () => {
    applyFormatRegion({ language: 'es', region: 'en-gb' })
    expect(moment.months()[5]).toBe('junio')
    expect(sample().format('L')).toBe('11/06/2026')
    applyFormatRegion({ language: 'en' })
  })

  it('takes start of week from the Region', () => {
    const resolved = applyFormatRegion({ language: 'en', region: 'en-gb' })
    expect(resolved.startOfWeek).toBe(
      moment.localeData('en-gb').firstDayOfWeek()
    )
    expect(moment.localeData().firstDayOfWeek()).toBe(resolved.startOfWeek)
  })

  it('restores the language defaults when Region returns to Auto', () => {
    applyFormatRegion({ language: 'en', region: 'en-au' })
    applyFormatRegion({ language: 'en' }) // device mock = en-US, 12h, Sunday
    expect(sample().format('L')).toBe('06/11/2026')
    expect(sample().format('LT')).toBe('1:30 PM')
    expect(moment.localeData().firstDayOfWeek()).toBe(0)
  })

  it('honors a Date Order override on numeric forms only', () => {
    applyFormatRegion({
      language: 'en',
      region: 'en-au',
      dateOrderOverride: 'mdy',
    })
    expect(sample().format('L')).toBe('06/11/2026')
    // Textual month-name dates keep Region ordering (en-au LL is day-first).
    expect(sample().format('LL')).toBe('11 June 2026')
    // Lowercase `ll` is re-derived by moment from the patched `LL` — lock in
    // that derivation so call sites migrated to `ll` stay Region-ordered.
    expect(sample().format('ll')).toBe('11 Jun 2026')
  })

  it('honors a Time Format override, including inside LLL', () => {
    applyFormatRegion({
      language: 'en',
      timeFormatOverride: '24',
    })
    expect(sample().format('LT')).toBe('13:30')
    expect(sample().format('LLL')).not.toContain('PM')
    expect(sample().format('LLL')).toContain('13:30')
  })

  it('honors a Start of Week override over the Region', () => {
    const resolved = applyFormatRegion({
      language: 'en',
      region: 'en-gb',
      startOfWeekOverride: 3,
    })
    expect(resolved.startOfWeek).toBe(3)
    expect(moment.localeData().firstDayOfWeek()).toBe(3)
  })

  it('never lazy-requires an unbundled locale for a region-suffixed language', () => {
    // Regression for JW-TIME-CH: `moment.locale('ko-kr')` triggered moment's
    // `require('./locale/ko-kr')`, an uncatchable fatal under Metro. The
    // language must collapse to a loaded base ('ja' is imported above) or 'en'
    // without throwing.
    expect(() => applyFormatRegion({ language: 'ja-jp' })).not.toThrow()
    expect(moment.locale()).toBe('ja')
    expect(() => applyFormatRegion({ language: 'ko-kr' })).not.toThrow()
    // 'ko' isn't imported in this test bundle, so it falls back to 'en'.
    expect(moment.locale()).toBe('en')
  })

  it('falls back to device calendar settings when Region is Auto', () => {
    device.uses24hourClock = true
    device.firstWeekday = 2 // expo MONDAY
    const resolved = applyFormatRegion({ language: 'en' })
    expect(resolved.timeFormat).toBe('24')
    expect(resolved.startOfWeek).toBe(1)
    expect(sample().format('LT')).toBe('13:30')
  })
})

describe('resolvers', () => {
  it('resolveStartOfWeek: override → region → device', () => {
    expect(resolveStartOfWeek({ override: 5, region: 'en-gb' })).toBe(5)
    expect(resolveStartOfWeek({ region: 'en-gb' })).toBe(
      moment.localeData('en-gb').firstDayOfWeek()
    )
    device.firstWeekday = 3 // expo TUESDAY
    expect(resolveStartOfWeek({})).toBe(2)
  })

  it('resolveTimeFormat: override → region → device', () => {
    expect(resolveTimeFormat({ override: '24', region: 'en' })).toBe('24')
    expect(resolveTimeFormat({ region: 'ja' })).toBe('24')
    device.uses24hourClock = true
    expect(resolveTimeFormat({})).toBe('24')
  })

  it('resolveDateOrder: override → region → device locale pattern', () => {
    expect(resolveDateOrder({ override: 'ymd', region: 'en-au' })).toBe('ymd')
    expect(resolveDateOrder({ region: 'en-au' })).toBe('dmy')
    expect(resolveDateOrder({ region: 'ja' })).toBe('ymd')
    device.languageTag = 'en-AU'
    expect(resolveDateOrder({})).toBe('dmy')
  })
})

describe('getPristineLongDateFormat', () => {
  it('returns the unpatched pattern for the Region-patched language key', () => {
    applyFormatRegion({ language: 'en', region: 'en-au' })
    expect(moment.localeData('en').longDateFormat('L')).toBe('DD/MM/YYYY')
    expect(getPristineLongDateFormat('en', 'L')).toBe('MM/DD/YYYY')
    expect(getPristineLongDateFormat('en-au', 'L')).toBe('DD/MM/YYYY')
  })
})

describe('compact helpers', () => {
  it('flips day/month order by Region while staying short', () => {
    applyFormatRegion({ language: 'en', region: 'en-au' })
    expect(formatMonthDayCompact(sample())).toBe('11 Jun')
    expect(formatWeekdayMonthDayCompact(sample())).toBe('Thu, 11 Jun')

    applyFormatRegion({ language: 'en', region: 'en' })
    expect(formatMonthDayCompact(sample())).toBe('Jun 11')
    expect(formatWeekdayMonthDayCompact(sample())).toBe('Thu, Jun 11')
  })

  it('follows the Date Order override', () => {
    applyFormatRegion({ language: 'en', dateOrderOverride: 'dmy' })
    expect(formatMonthDayCompact(sample())).toBe('11 Jun')
  })
})

describe('formatTime (point-in-time, honors Clock Format)', () => {
  it('renders the locale `LT`/`LTS` clock', () => {
    expect(formatTime(sample())).toBe('1:30 PM')
    expect(formatTime(sample(), { withSeconds: true })).toBe('1:30:00 PM')
  })

  it('honors a 24-hour Time Format (the hardcoded `h:mm A` bug fix)', () => {
    applyFormatRegion({ language: 'en', timeFormatOverride: '24' })
    expect(formatTime(sample())).toBe('13:30')
    expect(formatTime(sample(), { withSeconds: true })).toBe('13:30:00')
  })
})

describe('formatDate (full date, honors Format Region)', () => {
  it('renders written-out and abbreviated month dates', () => {
    expect(formatDate(sample())).toBe('June 11, 2026')
    expect(formatDate(sample(), { style: 'medium' })).toBe('Jun 11, 2026')
  })

  it('honors Region date order (the hardcoded `MMM D, YYYY` bug fix)', () => {
    applyFormatRegion({ language: 'en', region: 'en-au' })
    expect(formatDate(sample())).toBe('11 June 2026')
    expect(formatDate(sample(), { style: 'medium' })).toBe('11 Jun 2026')
  })
})

describe('formatDateTime (date + time, honors both axes)', () => {
  it('renders `LLL`/`lll`', () => {
    expect(formatDateTime(sample())).toBe('June 11, 2026 1:30 PM')
    expect(formatDateTime(sample(), { style: 'medium' })).toBe(
      'Jun 11, 2026 1:30 PM'
    )
  })

  it('composes a seconds timestamp honoring Region + 24-hour clock', () => {
    expect(
      formatDateTime(sample(), { style: 'medium', withSeconds: true })
    ).toBe('Jun 11, 2026 1:30:00 PM')
    applyFormatRegion({
      language: 'en',
      region: 'en-au',
      timeFormatOverride: '24',
    })
    expect(
      formatDateTime(sample(), { style: 'medium', withSeconds: true })
    ).toBe('11 Jun 2026 13:30:00')
  })
})

describe('formatRelative (relative time)', () => {
  it('wraps fromNow with and without the ago/in suffix', () => {
    const threeDaysAgo = moment().subtract(3, 'days')
    expect(formatRelative(threeDaysAgo)).toBe('3 days ago')
    expect(formatRelative(threeDaysAgo, { withoutSuffix: true })).toBe('3 days')
  })
})

describe('formatCalendar (calendar-relative time)', () => {
  it('uses the locale calendar buckets relative to a reference time', () => {
    const ref = sample()
    expect(
      formatCalendar(ref.clone().subtract(1, 'day'), { referenceTime: ref })
    ).toMatch(/Yesterday/)
  })

  it('falls through to the supplied sameElse pattern outside the window', () => {
    const ref = sample().clone().add(30, 'days')
    expect(
      formatCalendar(sample(), {
        referenceTime: ref,
        formats: { sameElse: 'LL' },
      })
    ).toBe('June 11, 2026')
  })
})

describe('formatStartTime (plan start time, honors Clock Format)', () => {
  it('renders minutes-since-midnight via the locale clock', () => {
    expect(formatStartTime(540)).toBe('9:00 AM')
    expect(formatStartTime(undefined)).toBe(formatStartTime(720))
    applyFormatRegion({ language: 'en', timeFormatOverride: '24' })
    expect(formatStartTime(540)).toBe('09:00')
  })
})
