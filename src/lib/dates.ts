import moment from 'moment'
import { getCalendars, getLocales } from 'expo-localization'
import {
  calendarDaysBetween,
  DEFAULT_START_TIME_IN_MINUTES,
} from '@/lib/normalizeDate'
import { loadMomentLocale } from '@/lib/momentLocales'
import { RLM } from '@/lib/digits'
import { localizeAppDateText, setNumberConventions } from '@/lib/numbers'

export type TimeFormat = '12' | '24'
export type DateOrder = 'mdy' | 'dmy' | 'ymd'

export const FORMAT_REGIONS = [
  'en',
  'en-au',
  'en-ca',
  'en-gb',
  'en-ie',
  'en-il',
  'en-nz',
  'en-sg',
  'de',
  'de-at',
  'de-ch',
  'es',
  'es-us',
  'es-do',
  'fr',
  'fr-ca',
  'fr-ch',
  'it',
  'it-ch',
  'ja',
  'ko',
  'pt',
  'pt-br',
  'ru',
  'nl',
  'nl-be',
  'sw',
  'uk',
  'vi',
  'zh-cn',
  'zh-tw',

  'ar',
] as const
export type FormatRegion = (typeof FORMAT_REGIONS)[number]

export interface FormatRegionConfig {
  language: string

  region?: string

  startOfWeekOverride?: number

  timeFormatOverride?: TimeFormat

  dateOrderOverride?: DateOrder
}

export interface ResolvedFormatSettings {
  startOfWeek: number
  timeFormat: TimeFormat
  dateOrder: DateOrder
}

const safeLocaleData = (key: string | undefined): moment.Locale | null => {
  if (!key) return null
  loadMomentLocale(key)
  const loaded = moment.locales()
  const safeKey = loaded.includes(key)
    ? key
    : loaded.includes(key.split('-')[0])
      ? key.split('-')[0]
      : null
  if (!safeKey) return null
  try {
    return moment.localeData(safeKey) ?? null
  } catch {
    return null
  }
}

const safeMomentLocale = (key: string): string => {
  loadMomentLocale(key)
  const loaded = moment.locales()
  if (loaded.includes(key)) {
    moment.locale(key)
  } else {
    const language = key.split('-')[0]
    moment.locale(loaded.includes(language) ? language : 'en')
  }
  return moment.locale()
}

export const getDateOrderFromPattern = (pattern: string): DateOrder => {
  const d = pattern.indexOf('D')
  const m = pattern.indexOf('M')
  const y = pattern.indexOf('Y')
  if (y !== -1 && (d === -1 || y < d) && (m === -1 || y < m)) return 'ymd'
  if (d !== -1 && (m === -1 || d < m)) return 'dmy'
  return 'mdy'
}

export const reorderNumericPattern = (
  pattern: string,
  order: DateOrder
): string => {
  const parts = pattern.match(/D+|M+|Y+/g)
  const seps = pattern.split(/D+|M+|Y+/)
  if (!parts || parts.length !== 3 || seps.length !== 4) return pattern
  const byLetter: Partial<Record<'d' | 'm' | 'y', string>> = {}
  for (const part of parts) {
    byLetter[part[0].toLowerCase() as 'd' | 'm' | 'y'] = part
  }
  if (!byLetter.d || !byLetter.m || !byLetter.y) return pattern
  const [first, second, third] = order.split('') as ('d' | 'm' | 'y')[]
  return (
    seps[0] +
    byLetter[first] +
    seps[1] +
    byLetter[second] +
    seps[2] +
    byLetter[third] +
    seps[3]
  )
}

export const withRtlDateMarks = (pattern: string): string =>
  pattern.replace(new RegExp(`([/.\\-])(?!${RLM})`, 'g'), `$1${RLM}`)

export const withoutRtlDateMarks = (pattern: string): string =>
  pattern.split(RLM).join('')

const timeFormatFromPattern = (lt: string): TimeFormat =>
  /[aA]/.test(lt) ? '12' : '24'

const LT_PATTERNS: Record<TimeFormat, { LT: string; LTS: string }> = {
  '12': { LT: 'h:mm A', LTS: 'h:mm:ss A' },
  '24': { LT: 'HH:mm', LTS: 'HH:mm:ss' },
}

const HOUR_WORD_AFTER_TIME = /(LTS?) \[Uhr\]/g

const CALENDAR_KEYS = [
  'sameDay',
  'nextDay',
  'nextWeek',
  'lastDay',
  'lastWeek',
  'sameElse',
] as const

const calendarFor12HourClock = (
  language: moment.Locale
): moment.CalendarSpec => {
  const spec: moment.CalendarSpec = {}
  for (const key of CALENDAR_KEYS) {
    spec[key] = function (this: moment.Moment, now?: moment.MomentInput) {
      return language
        .calendar(key, this, now as moment.Moment | undefined)
        .replace(HOUR_WORD_AFTER_TIME, '$1')
    }
  }
  return spec
}

const deviceLocaleData = (): moment.Locale | null => {
  const tag = getLocales()[0]?.languageTag?.toLowerCase()
  if (!tag) return null
  loadMomentLocale(tag)

  const loaded = moment.locales()
  if (loaded.includes(tag)) return safeLocaleData(tag)
  const language = tag.split('-')[0]
  if (loaded.includes(language)) return safeLocaleData(language)
  return null
}

const deviceRegionCode = (): string | null => {
  try {
    return getLocales()[0]?.regionCode ?? null
  } catch {
    return null
  }
}

const deviceFirstDayOfWeek = (): number | null => {
  try {
    const firstWeekday = getCalendars()[0]?.firstWeekday

    if (typeof firstWeekday === 'number') return firstWeekday - 1
  } catch {}
  return null
}

const deviceTimeFormat = (): TimeFormat | null => {
  try {
    const uses24 = getCalendars()[0]?.uses24hourClock
    if (typeof uses24 === 'boolean') return uses24 ? '24' : '12'
  } catch {}
  return null
}

export const resolveStartOfWeek = (config: {
  override?: number
  region?: string
}): number => {
  if (config.override !== undefined) return config.override
  const regionData = safeLocaleData(config.region)
  if (regionData) return regionData.firstDayOfWeek()
  return deviceFirstDayOfWeek() ?? moment.localeData().firstDayOfWeek()
}

export const resolveTimeFormat = (config: {
  override?: TimeFormat
  region?: string
}): TimeFormat => {
  if (config.override) return config.override
  const regionData = safeLocaleData(config.region)
  if (regionData) return timeFormatFromPattern(regionData.longDateFormat('LT'))
  return (
    deviceTimeFormat() ??
    timeFormatFromPattern(moment.localeData().longDateFormat('LT'))
  )
}

export const resolveDateOrder = (config: {
  override?: DateOrder
  region?: string
}): DateOrder => {
  if (config.override) return config.override
  const source =
    safeLocaleData(config.region) ?? deviceLocaleData() ?? moment.localeData()
  return getDateOrderFromPattern(source.longDateFormat('L'))
}

const LONG_DATE_TOKENS = ['LT', 'LTS', 'L', 'LL', 'LLL', 'LLLL'] as const
type LongDateToken = (typeof LONG_DATE_TOKENS)[number]
type LongDateFormatMap = Record<LongDateToken, string>

const readLongDateFormat = (data: moment.Locale): LongDateFormatMap => {
  const out = {} as LongDateFormatMap
  for (const token of LONG_DATE_TOKENS) {
    out[token] = data.longDateFormat(token)
  }
  return out
}

let patchedKey: string | null = null
let patchedKeyPristine: LongDateFormatMap | null = null

export const numericPatternForLanguage = (pattern: string): string =>
  patchedKeyPristine?.L.includes(RLM)
    ? withRtlDateMarks(pattern)
    : withoutRtlDateMarks(pattern)

export const getPristineLongDateFormat = (
  key: string,
  token: LongDateToken
): string | null => {
  if (key === patchedKey && patchedKeyPristine) {
    return patchedKeyPristine[token]
  }
  const data = safeLocaleData(key)
  return data ? data.longDateFormat(token) : null
}

type LayeredLocale = moment.Locale & { parentLocale?: moment.Locale }

const removeOverlays = (key: string): void => {
  if (!moment.locales().includes(key)) return
  while ((moment.localeData(key) as LayeredLocale).parentLocale) {
    moment.updateLocale(key, null)
  }
}

export const applyFormatRegion = (
  config: FormatRegionConfig
): ResolvedFormatSettings => {
  const activeKey = safeMomentLocale(config.language)

  setNumberConventions({
    language: config.language,
    region: config.region,
    deviceRegion: deviceRegionCode(),
  })

  if (patchedKey) removeOverlays(patchedKey)
  removeOverlays(activeKey)
  patchedKey = null
  patchedKeyPristine = null
  moment.locale(activeKey)

  const languageData = moment.localeData(activeKey)
  const languagePristine = readLongDateFormat(languageData)
  patchedKey = activeKey
  patchedKeyPristine = languagePristine

  const resolved: ResolvedFormatSettings = {
    startOfWeek: resolveStartOfWeek({
      override: config.startOfWeekOverride,
      region: config.region,
    }),
    timeFormat: resolveTimeFormat({
      override: config.timeFormatOverride,
      region: config.region,
    }),
    dateOrder: resolveDateOrder({
      override: config.dateOrderOverride,
      region: config.region,
    }),
  }

  const source =
    safeLocaleData(config.region) ?? (config.region ? null : deviceLocaleData())
  const base = source ? readLongDateFormat(source) : { ...languagePristine }

  const longDateFormat: LongDateFormatMap = { ...base }

  longDateFormat.L = reorderNumericPattern(base.L, resolved.dateOrder)
  longDateFormat.L = numericPatternForLanguage(longDateFormat.L)

  const lt = LT_PATTERNS[resolved.timeFormat]
  const previousLT = base.LT
  longDateFormat.LT = lt.LT
  longDateFormat.LTS = lt.LTS

  if (previousLT !== lt.LT) {
    longDateFormat.LLL = base.LLL.includes(previousLT)
      ? base.LLL.replace(previousLT, lt.LT)
      : `${longDateFormat.LL} ${lt.LT}`
    longDateFormat.LLLL = base.LLLL.includes(previousLT)
      ? base.LLLL.replace(previousLT, lt.LT)
      : `dddd, ${longDateFormat.LL} ${lt.LT}`
  }

  moment.updateLocale(activeKey, {
    longDateFormat,
    week: { dow: resolved.startOfWeek },

    ...(resolved.timeFormat === '12' && {
      calendar: calendarFor12HourClock(languageData),
    }),
  })

  moment.locale(activeKey)

  return resolved
}

const activeDayFirst = (): boolean =>
  getDateOrderFromPattern(moment.localeData().longDateFormat('L')) === 'dmy'

export const formatMonthDayCompact = (m: moment.Moment): string =>
  formatDisplay(m, activeDayFirst() ? 'D MMM' : 'MMM D')

export const formatWeekdayDayCompact = (m: moment.Moment): string =>
  formatDisplay(m, 'ddd D')

export const formatWeekdayMonthDayCompact = (m: moment.Moment): string =>
  formatDisplay(m, activeDayFirst() ? 'ddd, D MMM' : 'ddd, MMM D')

export const activeDateConventions = (): {
  dayFirst: boolean
  clock24: boolean
} => ({
  dayFirst: activeDayFirst(),
  clock24: !/h/.test(moment.localeData().longDateFormat('LT')),
})

const appleLocaleTag = (tag: string): string => {
  const parts = tag.toLowerCase().split('-')
  const language = parts[0]
  const country =
    parts.length > 1 && parts[parts.length - 1].length === 2
      ? parts[parts.length - 1].toUpperCase()
      : undefined
  if (language === 'zh') {
    const traditional =
      parts.includes('hant') || ['TW', 'HK', 'MO'].includes(country ?? '')
    return ['zh', traditional ? 'Hant' : 'Hans', country]
      .filter(Boolean)
      .join('_')
  }
  return [language, country].filter(Boolean).join('_')
}

const baseLanguage = (tag: string) => tag.toLowerCase().split('-')[0]

export const appleLocaleIdentifier = (config: {
  language: string

  region?: string
}): string | undefined => {
  const language = baseLanguage(config.language)
  if (config.region) {
    return baseLanguage(config.region) === language
      ? appleLocaleTag(config.region)
      : appleLocaleTag(config.language)
  }
  const device = getLocales()[0]?.languageTag
  if (device && baseLanguage(device) === language) return undefined
  return appleLocaleTag(config.language)
}

export const localizeDisplayDate = (text: string): string =>
  localizeAppDateText(text)

export const formatDisplay = (
  input: moment.MomentInput,
  pattern: string
): string => localizeDisplayDate(moment(input).format(pattern))

export type DateStyle = 'long' | 'medium'

export const formatTime = (
  input: moment.MomentInput,
  options?: { withSeconds?: boolean }
): string => formatDisplay(input, options?.withSeconds ? 'LTS' : 'LT')

export const formatDate = (
  input: moment.MomentInput,
  options?: { style?: DateStyle }
): string => formatDisplay(input, options?.style === 'medium' ? 'll' : 'LL')

export const formatDateTime = (
  input: moment.MomentInput,
  options?: { style?: DateStyle; withSeconds?: boolean }
): string => {
  const medium = options?.style === 'medium'
  if (options?.withSeconds)
    return formatDisplay(input, medium ? 'll LTS' : 'LL LTS')
  return formatDisplay(input, medium ? 'lll' : 'LLL')
}

export const formatRelative = (
  input: moment.MomentInput,
  options?: { withoutSuffix?: boolean }
): string => localizeDisplayDate(moment(input).fromNow(options?.withoutSuffix))

export const formatCalendar = (
  input: moment.MomentInput,
  options?: {
    referenceTime?: moment.MomentInput
    formats?: moment.CalendarSpec
  }
): string => {
  const date = moment(input)
  const now = moment(options?.referenceTime ?? undefined)

  const days = calendarDaysBetween(now, date)
  const bucket: moment.CalendarKey =
    days < -6
      ? 'sameElse'
      : days < -1
        ? 'lastWeek'
        : days === -1
          ? 'lastDay'
          : days === 0
            ? 'sameDay'
            : days === 1
              ? 'nextDay'
              : days < 7
                ? 'nextWeek'
                : 'sameElse'
  const spec = options?.formats?.[bucket]
  const pattern =
    typeof spec === 'function'
      ? spec.call(date, now)
      : (spec ?? date.localeData().calendar(bucket, date, now))
  return localizeDisplayDate(date.format(pattern))
}

export const formatStartTime = (startTimeInMinutes?: number): string => {
  const minutes = startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES

  return formatTime(moment.utc(0).add(minutes, 'minutes'))
}
