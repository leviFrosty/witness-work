import { beforeEach, describe, expect, it, vi } from 'vitest'

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
import {
  appleLocaleIdentifier,
  applyFormatRegion,
  FORMAT_REGIONS,
  formatDate,
  formatDisplay,
  formatMonthDayCompact,
  formatTime,
  localizeDisplayDate,
  resolveStartOfWeek,
} from '@/lib/dates'
import { JW_ARABIC_MONTHS, JW_ARABIC_MONTHS_SHORT } from '@/lib/momentLocales'
import { RLM } from '@/lib/digits'

const sample = () => moment('2026-10-14T13:30:00')

beforeEach(() => {
  device.languageTag = 'en-US'
  device.uses24hourClock = false
  device.firstWeekday = 1
  applyFormatRegion({ language: 'en' })
})

describe('moment ar with JW month names', () => {
  beforeEach(() => applyFormatRegion({ language: 'ar', region: 'ar' }))

  it('writes the Levantine name with the Egyptian one in parentheses', () => {
    expect(moment.months()).toEqual(JW_ARABIC_MONTHS)
    expect(sample().format('MMMM')).toBe('تشرين الأول (أكتوبر)')
    expect(moment('2026-01-05').format('MMMM')).toBe('كانون الثاني (يناير)')
    expect(moment('2026-08-05').format('MMMM')).toBe('آب (أغسطس)')
  })

  it('uses the Levantine name alone where space is tight', () => {
    expect(moment.monthsShort()).toEqual(JW_ARABIC_MONTHS_SHORT)
    expect(sample().format('MMM')).toBe('تشرين الأول')
    expect(formatMonthDayCompact(sample())).toBe('١٤ تشرين الأول')
  })

  it("keeps moment's Arabic weekdays, with Arabic-Indic digits on display", () => {
    expect(sample().format('dddd')).toBe('الأربعاء')
    expect(formatDate(sample())).toBe('١٤ تشرين الأول (أكتوبر) ٢٠٢٦')
    expect(formatDisplay(sample(), 'L')).toBe(`١٤/${RLM}١٠/${RLM}٢٠٢٦`)
    expect(formatTime(sample())).toBe('١٣:٣٠')
  })

  it('keeps the JW names after the Format Region changes', () => {
    applyFormatRegion({ language: 'ar', region: 'en-gb' })
    applyFormatRegion({ language: 'ar', region: undefined })
    applyFormatRegion({ language: 'ar', region: 'ar' })
    expect(sample().format('MMMM')).toBe('تشرين الأول (أكتوبر)')
  })

  it('keeps Arabic relative times and plurals', () => {
    expect(localizeDisplayDate(sample().from(sample().add(3, 'days')))).toBe(
      'منذ ٣ أيام'
    )
  })
})

describe('the Arabic Format Region', () => {
  it('is offered, and starts the week on Saturday', () => {
    expect(FORMAT_REGIONS).toContain('ar')
    expect(resolveStartOfWeek({ region: 'ar' })).toBe(6)
    const resolved = applyFormatRegion({ language: 'en', region: 'ar' })
    expect(resolved).toMatchObject({
      startOfWeek: 6,
      timeFormat: '24',
      dateOrder: 'dmy',
    })
  })

  it('leaves English names when only the Region is Arabic', () => {
    applyFormatRegion({ language: 'en', region: 'ar' })
    expect(formatDate(sample())).toBe('14 October 2026')
  })

  it('follows the device at Auto, like every other Language', () => {
    device.languageTag = 'en-US'
    device.firstWeekday = 1
    const resolved = applyFormatRegion({ language: 'ar' })
    expect(resolved.startOfWeek).toBe(0)
    expect(resolved.dateOrder).toBe('mdy')
  })

  it('keeps Arabic numeric dates reading right to left in any order', () => {
    applyFormatRegion({ language: 'ar', region: 'en' })

    expect(formatDisplay(sample(), 'L')).toBe(`١٠/${RLM}١٤/${RLM}٢٠٢٦`)
    applyFormatRegion({ language: 'ar', region: 'de' })
    expect(formatDisplay(sample(), 'L')).toBe(`١٤.${RLM}١٠.${RLM}٢٠٢٦`)
    applyFormatRegion({ language: 'ar', dateOrderOverride: 'ymd' })
    expect(formatDisplay(sample(), 'L')).toMatch(new RegExp(`^٢٠٢٦\\D${RLM}`))
  })

  it("doesn't add marks for left-to-right Languages", () => {
    applyFormatRegion({ language: 'en', region: 'ar' })
    expect(sample().format('L')).not.toContain(RLM)
  })
})

describe('appleLocaleIdentifier for Arabic', () => {
  it('hands the native picker Arabic', () => {
    expect(appleLocaleIdentifier({ language: 'ar' })).toBe('ar')
    expect(appleLocaleIdentifier({ language: 'ar', region: 'ar' })).toBe('ar')
    expect(appleLocaleIdentifier({ language: 'ar', region: 'en-gb' })).toBe(
      'ar'
    )
  })
})
