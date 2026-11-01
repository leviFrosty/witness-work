import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))

import moment from 'moment'
import { applyFormatRegion, formatCalendar, formatTime } from '@/lib/dates'
import { loadMomentLocale } from '@/lib/momentLocales'

type LayeredLocale = moment.Locale & { parentLocale?: LayeredLocale }

const LANGUAGES = ['de', 'en', 'fr', 'ar', 'ru']
const REGIONS = [undefined, 'en', 'de', 'fr', 'en-gb', 'ar']
const CLOCKS = ['12', '24', undefined] as const

const ref = () => moment('2026-06-11T13:30:00')
const BUCKET_OFFSETS = [0, 1, -1, 3, -3, 30]

const layers = (key: string) => {
  let depth = 0
  for (
    let data = moment.localeData(key) as LayeredLocale;
    data.parentLocale;
    data = data.parentLocale
  ) {
    depth++
  }
  return depth
}

const localePrototype = Object.getPrototypeOf(moment.localeData())

const renderBuckets = () =>
  BUCKET_OFFSETS.map((days) => {
    const date = ref().add(days, 'days')
    return { days, date, text: formatCalendar(date, { referenceTime: ref() }) }
  })

beforeEach(() => {
  for (const language of LANGUAGES) loadMomentLocale(language)
  applyFormatRegion({ language: 'en' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applyFormatRegion run again and again', () => {
  it('keeps every calendar bucket the same, without wrappers stacking', () => {
    const calendarSpy = vi.spyOn(localePrototype, 'calendar')
    const seen = new Map<string, string[]>()

    for (let i = 0; i < 200; i++) {
      const language = LANGUAGES[i % LANGUAGES.length]
      const region = REGIONS[(i * 7) % REGIONS.length]
      const clock = CLOCKS[(i * 3) % CLOCKS.length]
      const resolved = applyFormatRegion({
        language,
        region,
        timeFormatOverride: clock,
      })

      expect(layers(language)).toBe(1)

      calendarSpy.mockClear()
      const buckets = renderBuckets()

      expect(calendarSpy).toHaveBeenCalledTimes(
        BUCKET_OFFSETS.length * (resolved.timeFormat === '12' ? 2 : 1)
      )

      for (const { days, date, text } of buckets) {
        if (days === 30) continue
        if (resolved.timeFormat === '12') expect(text).not.toMatch(/Uhr/)
        expect(text, `${language} ${region} ${clock} ${days}`).toContain(
          formatTime(date)
        )
      }

      const key = `${language}|${region}|${clock}`
      const texts = buckets.map((bucket) => bucket.text)
      if (seen.has(key)) expect(texts, key).toEqual(seen.get(key))
      else seen.set(key, texts)
    }

    applyFormatRegion({ language: 'de', region: 'en' })
    expect(formatCalendar(ref(), { referenceTime: ref() })).toBe(
      'heute um 1:30 PM'
    )
    applyFormatRegion({ language: 'de', region: 'de' })
    expect(formatCalendar(ref(), { referenceTime: ref() })).toBe(
      'heute um 13:30 Uhr'
    )
  })

  it('leaves every Language pristine once another one takes over', () => {
    for (const language of LANGUAGES) {
      applyFormatRegion({ language, timeFormatOverride: '12' })
    }
    applyFormatRegion({ language: 'en' })
    for (const language of LANGUAGES.filter((key) => key !== 'en')) {
      expect(layers(language)).toBe(0)
    }
    expect(moment.localeData('de').calendar('sameDay', ref(), ref())).toBe(
      '[heute um] LT [Uhr]'
    )
  })
})

describe('dates.ts evaluated again over the same moment', () => {
  it('replaces the earlier overlay instead of wrapping it', async () => {
    applyFormatRegion({ language: 'de', region: 'en' })

    vi.resetModules()
    const fresh = await import('@/lib/dates')
    const freshMoment = (await import('moment')).default
    expect(freshMoment).toBe(moment)

    for (const clock of ['12', '24', '12'] as const) {
      fresh.applyFormatRegion({ language: 'de', timeFormatOverride: clock })
      expect(layers('de')).toBe(1)
      expect(fresh.formatCalendar(ref(), { referenceTime: ref() })).toBe(
        clock === '12' ? 'heute um 1:30 PM' : 'heute um 13:30 Uhr'
      )
    }

    fresh.applyFormatRegion({ language: 'en' })
    expect(layers('de')).toBe(0)
  })
})
