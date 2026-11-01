import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const originalTZ = process.env.TZ

const device = {
  languageTag: 'en-US',
  uses24hourClock: false as boolean | null,
  firstWeekday: 1 as number | null,
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
  appleLocaleIdentifier,
  applyFormatRegion,
  formatCalendar,
  formatDate,
  formatDateTime,
  formatMonthDayCompact,
  formatRelative,
  formatStartTime,
  formatTime,
  formatWeekdayDayCompact,
  formatWeekdayMonthDayCompact,
  getDateOrderFromPattern,
  getPristineLongDateFormat,
  reorderNumericPattern,
  resolveDateOrder,
  resolveStartOfWeek,
  resolveTimeFormat,
} from '@/lib/dates'
import { loadableMomentLocales } from '@/lib/momentLocales'

const sample = () => moment('2026-06-11T13:30:00')

afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

beforeEach(() => {
  device.languageTag = 'en-US'
  device.uses24hourClock = false
  device.firstWeekday = 1

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
    applyFormatRegion({ language: 'en' })
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

    expect(sample().format('LL')).toBe('11 June 2026')

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
    expect(() => applyFormatRegion({ language: 'ja-jp' })).not.toThrow()
    expect(moment.locale()).toBe('ja')
    expect(() => applyFormatRegion({ language: 'ko-kr' })).not.toThrow()

    expect(moment.locale()).toBe('ko')

    expect(() => applyFormatRegion({ language: 'rw-rw' })).not.toThrow()
    expect(moment.locale()).toBe('en')
  })

  it('never lazy-requires an unbundled region key when reading format data', () => {
    expect(() =>
      applyFormatRegion({ language: 'en', region: 'es-es' })
    ).not.toThrow()
    expect(sample().format('L')).toBe('11/06/2026')
  })

  it('falls back to device calendar settings when Region is Auto', () => {
    device.uses24hourClock = true
    device.firstWeekday = 2
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
    device.firstWeekday = 3
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

describe('appleLocaleIdentifier', () => {
  const id = (language: string, region?: string) =>
    appleLocaleIdentifier({ language, region })

  it("uses the Format Region when it's in the Language", () => {
    expect(id('en-us', 'en-au')).toBe('en_AU')
    expect(id('de-de', 'de-ch')).toBe('de_CH')
    expect(id('zh-hant-tw', 'zh-tw')).toBe('zh_Hant_TW')
  })

  it("falls back to the Language's own locale across languages", () => {
    expect(id('es-es', 'en-au')).toBe('es_ES')
    expect(id('zh-hans-cn', 'en-gb')).toBe('zh_Hans_CN')
  })

  it("keeps the device's locale at Auto when the Language matches it", () => {
    device.languageTag = 'en-GB'
    expect(id('en-us')).toBeUndefined()
    expect(id('de-de')).toBe('de_DE')
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
    expect(formatWeekdayDayCompact(sample())).toBe('Thu 11')
    expect(formatWeekdayMonthDayCompact(sample())).toBe('Thu, 11 Jun')

    applyFormatRegion({ language: 'en', region: 'en' })
    expect(formatMonthDayCompact(sample())).toBe('Jun 11')
    expect(formatWeekdayDayCompact(sample())).toBe('Thu 11')
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

  it('renders a Scribe reset in the device timezone with independent Language and Format Region', () => {
    process.env.TZ = 'America/Los_Angeles'
    const reset = '2026-06-11T00:30:00.000Z'

    applyFormatRegion({ language: 'es', region: 'en-au' })
    expect(formatDate(reset)).toBe('10 junio 2026')

    applyFormatRegion({ language: 'en', region: 'en' })
    expect(formatDate(reset)).toBe('June 10, 2026')
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

  it('drops German "Uhr" after a 12-hour time and keeps it after a 24-hour one', () => {
    const ref = sample()

    applyFormatRegion({ language: 'de', region: 'en' })
    expect(formatCalendar(sample(), { referenceTime: ref })).toBe(
      'heute um 1:30 PM'
    )
    expect(
      formatCalendar(sample().subtract(1, 'day'), { referenceTime: ref })
    ).toBe('gestern um 1:30 PM')
    expect(
      formatCalendar(sample().add(3, 'days'), { referenceTime: ref })
    ).toBe('Sonntag um 1:30 PM')

    applyFormatRegion({ language: 'de', region: 'de' })
    expect(formatCalendar(sample(), { referenceTime: ref })).toBe(
      'heute um 13:30 Uhr'
    )

    applyFormatRegion({
      language: 'de',
      region: 'de',
      timeFormatOverride: '12',
    })
    expect(formatCalendar(sample(), { referenceTime: ref })).toBe(
      'heute um 1:30 PM'
    )

    applyFormatRegion({ language: 'de-at', timeFormatOverride: '24' })
    expect(formatCalendar(sample(), { referenceTime: ref })).toBe(
      'heute um 13:30 Uhr'
    )
  })

  it('keeps other Languages unchanged on either clock', () => {
    const ref = sample()
    applyFormatRegion({ language: 'en', timeFormatOverride: '24' })
    expect(formatCalendar(sample(), { referenceTime: ref })).toBe(
      'Today at 13:30'
    )
    applyFormatRegion({ language: 'fr', region: 'en' })
    expect(formatCalendar(sample(), { referenceTime: ref })).toBe(
      'Aujourd’hui à 1:30 PM'
    )
    applyFormatRegion({ language: 'ru', region: 'en' })
    expect(
      formatCalendar(sample().subtract(3, 'days'), { referenceTime: ref })
    ).toBe('В понедельник, в 1:30 дня')
  })

  it.each(['12', '24'] as const)(
    'ends every timed bucket with the %s-hour time in every Language',
    (clock) => {
      const ref = sample()
      for (const language of ['en', ...loadableMomentLocales]) {
        applyFormatRegion({ language, timeFormatOverride: clock })
        const hourWord =
          clock === '24' && language.startsWith('de') ? ' Uhr' : ''
        for (const days of [0, 1, -1, 3, -3]) {
          const date = sample().add(days, 'days')
          expect(
            formatCalendar(date, { referenceTime: ref }),
            `${language} ${days}`
          ).toMatch(new RegExp(`${formatTime(date)}${hourWord}$`))
        }
      }
    }
  )

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
