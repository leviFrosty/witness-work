import moment from 'moment'
import { getCalendars, getLocales } from 'expo-localization'
import { DEFAULT_START_TIME_IN_MINUTES } from '@/lib/normalizeDate'
import { loadMomentLocale } from '@/lib/momentLocales'
import { RLM } from '@/lib/digits'
import { localizeAppDateText, setNumberConventions } from '@/lib/numbers'

/**
 * Format Region seam — see
 * `docs/adr/0006-format-region-decoupled-from-language.md`.
 *
 * Language owns the words (month/weekday names); Format Region owns the
 * conventions (date order, 12/24-hour clock, first day of week). moment's
 * locale is a single global that bundles both, so we keep `moment.locale`
 * pinned to the Language and overlay the Region's conventions onto it via
 * `moment.updateLocale(language, { longDateFormat, week: { dow } })`, reading
 * the Region's patterns from moment's already-bundled locale data.
 *
 * Mirrors the `src/lib/minutes.ts` seam pattern: this module is the only place
 * the precedence chain (row override → Region → device) is encoded.
 */

export type TimeFormat = '12' | '24'
export type DateOrder = 'mdy' | 'dmy' | 'ymd'

/**
 * Curated Format Region options. Every key MUST have its moment locale listed
 * in `src/lib/momentLocales.ts` — `moment.localeData('<unloaded>')` silently
 * falls back to `en` (US conventions), which would make the picker lie. `'en'`
 * (United States) ships inside moment itself.
 */
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
  // moment's generic Arabic: Saturday-first weeks, as in Egypt, Iraq, Jordan,
  // Syria and the Gulf. Countries that differ get theirs from the device.
  'ar',
] as const
export type FormatRegion = (typeof FORMAT_REGIONS)[number]

export interface FormatRegionConfig {
  /**
   * Moment locale key the app's Language resolved to (post `handleLangFallback`
   *
   * - `formatLocaleForMoment`), e.g. `'es-es'`, `'de-de'`. moment itself may
   *   resolve it further to a loaded parent (`'de'`).
   */
  language: string
  /** Format Region moment locale key. `undefined` = Auto (device). */
  region?: string
  /** Explicit Start of Week row override (0 = Sunday … 6 = Saturday). */
  startOfWeekOverride?: number
  /** Explicit Time Format row override. */
  timeFormatOverride?: TimeFormat
  /** Explicit Date Order row override (numeric forms + compact helper only). */
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

/**
 * Activates a moment locale without ever triggering moment's lazy
 * `require('./locale/<key>')`. Under Metro that dynamic require throws an
 * UNCATCHABLE fatal ("Requiring unknown module …/locale/ko-kr") for any locale
 * file `src/lib/momentLocales.ts` doesn't list — so a device whose language
 * resolves to a region-suffixed key (`ko-kr`, `ja-jp`, …) crashed the app at
 * init. We only ever hand `moment.locale` a key it already loaded: the full
 * tag, else its base language, else moment's built-in default.
 *
 * Returns the key moment ended up on, which is what every patch below targets.
 */
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

/** First of D/M/Y appearing in a numeric pattern wins. */
export const getDateOrderFromPattern = (pattern: string): DateOrder => {
  const d = pattern.indexOf('D')
  const m = pattern.indexOf('M')
  const y = pattern.indexOf('Y')
  if (y !== -1 && (d === -1 || y < d) && (m === -1 || y < m)) return 'ymd'
  if (d !== -1 && (m === -1 || d < m)) return 'dmy'
  return 'mdy'
}

/**
 * Rearranges a numeric date pattern (`MM/DD/YYYY`, `DD.MM.YYYY`, …) into the
 * requested order while keeping the source's token widths and separators.
 * Returns the pattern untouched when it isn't a simple three-part numeric date
 * (defensive — some locales use exotic `L` patterns).
 */
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

/**
 * Puts a right-to-left mark after each separator of a numeric date pattern, the
 * way moment's `ar` writes its own (`D/<RLM>M/<RLM>YYYY`), so an Arabic date
 * keeps reading right to left in whatever order the Region puts its parts.
 */
export const withRtlDateMarks = (pattern: string): string =>
  pattern.replace(new RegExp(`([/.\\-])(?!${RLM})`, 'g'), `$1${RLM}`)

/** Strips the marks {@link withRtlDateMarks} adds. */
export const withoutRtlDateMarks = (pattern: string): string =>
  pattern.split(RLM).join('')

const timeFormatFromPattern = (lt: string): TimeFormat =>
  /[aA]/.test(lt) ? '12' : '24'

const LT_PATTERNS: Record<TimeFormat, { LT: string; LTS: string }> = {
  '12': { LT: 'h:mm A', LTS: 'h:mm:ss A' },
  '24': { LT: 'HH:mm', LTS: 'HH:mm:ss' },
}

/**
 * An hour word a Language's calendar templates put after the clock, which only
 * reads with a 24-hour time: German's `[heute um] LT [Uhr]` gives "heute um
 * 17:02 Uhr", but "heute um 5:02 PM Uhr" on a 12-hour clock. `de`, `de-at` and
 * `de-ch` are the only bundled locales that do this.
 */
const HOUR_WORD_AFTER_TIME = /(LTS?) \[Uhr\]/g

const CALENDAR_KEYS = [
  'sameDay',
  'nextDay',
  'nextWeek',
  'lastDay',
  'lastWeek',
  'sameElse',
] as const

/**
 * The Language's calendar templates for a 12-hour clock: each bucket as the
 * Language writes it, minus an hour word after the time. Buckets can be
 * functions of the date (Russian picks "в"/"во"), so this wraps each one.
 * moment calls a bucket with the date as `this` and the reference time as its
 * argument, whatever its typings say.
 */
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

/**
 * Best-effort moment locale data for the device's own locale, used only at the
 * device rung of the Date Order axis (no calendar API exposes ordering). Falls
 * back to `null` when the device locale isn't bundled — callers then keep the
 * language locale's own pattern.
 */
const deviceLocaleData = (): moment.Locale | null => {
  const tag = getLocales()[0]?.languageTag?.toLowerCase()
  if (!tag) return null
  loadMomentLocale(tag)
  // `moment.localeData('<unloaded>')` silently resolves to a parent or `en`,
  // which would smuggle US conventions in as "the device's". Only trust keys
  // moment has actually loaded.
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
    // expo-localization Weekday enum: SUNDAY = 1 … SATURDAY = 7.
    if (typeof firstWeekday === 'number') return firstWeekday - 1
  } catch {
    // getCalendars can throw in detached/test contexts — fall through.
  }
  return null
}

const deviceTimeFormat = (): TimeFormat | null => {
  try {
    const uses24 = getCalendars()[0]?.uses24hourClock
    if (typeof uses24 === 'boolean') return uses24 ? '24' : '12'
  } catch {
    // Same defensive fallthrough as above.
  }
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

/**
 * Pristine (pre-patch) `longDateFormat` of the locale key currently carrying
 * the Region overlay, captured by `applyFormatRegion` right after it resets the
 * key. Lets the settings UI render truthful per-region samples even for the
 * region that happens to share the active language's key.
 */
let patchedKey: string | null = null
let patchedKeyPristine: LongDateFormatMap | null = null

/**
 * A numeric date pattern (any Region's `L`) as the active Language writes it. A
 * right-to-left Language that marks its own numeric dates (Arabic) keeps
 * marking them in another Region's order; a left-to-right one drops the Arabic
 * Region's marks, which would scramble its dates.
 */
export const numericPatternForLanguage = (pattern: string): string =>
  patchedKeyPristine?.L.includes(RLM)
    ? withRtlDateMarks(pattern)
    : withoutRtlDateMarks(pattern)

/**
 * Pristine `longDateFormat` pattern for a locale key — routes around the Region
 * overlay when `key` is the currently-patched language locale.
 */
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

/**
 * Applies the Language + Format Region combination to moment's global state.
 *
 * Must run at app init and again on any Language or Region (or per-axis
 * override) change. Reads the Region's conventions from moment's bundled locale
 * data BEFORE mutating, then overlays them onto the _language_ locale so names
 * stay translated. Never call `moment.locale(region)` — that drags
 * month/weekday names along with the conventions.
 *
 * Returns the resolved per-axis settings (handy for "Auto → X" labels).
 */
export const applyFormatRegion = (
  config: FormatRegionConfig
): ResolvedFormatSettings => {
  // Activate the language. `safeMomentLocale` collapses region-suffixed keys
  // we never bundled (`ko-kr`, `ja-jp`, …) down to their loaded base language
  // ('ko', 'ja') or 'en', side-stepping moment's lazy `require('./locale/…')`
  // — that dynamic require is an uncatchable fatal under Metro. The resolved
  // key is the one we patch.
  const activeKey = safeMomentLocale(config.language)

  // Numbers follow the same Language and Region (`src/lib/numbers.ts`).
  setNumberConventions({
    language: config.language,
    region: config.region,
    deviceRegion: deviceRegionCode(),
  })

  // Reset the previous overlay so every localeData read below is pristine —
  // including the case where the chosen Region IS the active language key.
  // Only reset a key we actually patched: `updateLocale(key, null)` on a
  // never-updated locale DELETES it from moment's registry outright.
  if (patchedKey) {
    moment.updateLocale(patchedKey, null)
    patchedKey = null
    patchedKeyPristine = null
  }
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

  // Date patterns come from the Region (or, at the device rung, the device
  // locale when moment bundles it); otherwise the language keeps its own.
  const source =
    safeLocaleData(config.region) ?? (config.region ? null : deviceLocaleData())
  const base = source ? readLongDateFormat(source) : { ...languagePristine }

  const longDateFormat: LongDateFormatMap = { ...base }
  // Numeric forms follow the resolved Date Order (override included).
  longDateFormat.L = reorderNumericPattern(base.L, resolved.dateOrder)
  longDateFormat.L = numericPatternForLanguage(longDateFormat.L)
  // Clock follows the resolved Time Format.
  const lt = LT_PATTERNS[resolved.timeFormat]
  const previousLT = base.LT
  longDateFormat.LT = lt.LT
  longDateFormat.LTS = lt.LTS
  // LLL/LLLL embed the time pattern — swap it in place when it changed so a
  // 24-hour override doesn't leave 12-hour times inside long datetimes. When
  // the source pattern doesn't embed `LT` verbatim, rebuild from LL + LT
  // rather than silently keeping the stale clock.
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
    // "Today at 5:02 PM", never "heute um 5:02 PM Uhr".
    ...(resolved.timeFormat === '12' && {
      calendar: calendarFor12HourClock(languageData),
    }),
  })
  // updateLocale shouldn't move the global locale, but be defensive — every
  // caller expects the language to stay active.
  moment.locale(activeKey)

  return resolved
}

/**
 * Whether the active (Region-patched) locale writes the day before the month in
 * numeric dates. Drives the compact helpers' token order; `ymd` regions group
 * with month-first since the day still trails the month.
 */
const activeDayFirst = (): boolean =>
  getDateOrderFromPattern(moment.localeData().longDateFormat('L')) === 'dmy'

/**
 * Sanctioned compact bypass (mirrors `formatMinutesCompact`): tight headings
 * that deliberately omit the year render month+day short, flipping token order
 * by Region — `11 Jun` in day-first regions, `Jun 11` elsewhere.
 */
export const formatMonthDayCompact = (m: moment.Moment): string =>
  formatDisplay(m, activeDayFirst() ? 'D MMM' : 'MMM D')

/** Tight weekday + day-of-month variant for month-scoped lists — `Thu 11`. */
export const formatWeekdayDayCompact = (m: moment.Moment): string =>
  formatDisplay(m, 'ddd D')

/** Compact weekday + month/day variant — `Thu, 11 Jun` vs `Thu, Jun 11`. */
export const formatWeekdayMonthDayCompact = (m: moment.Moment): string =>
  formatDisplay(m, activeDayFirst() ? 'ddd, D MMM' : 'ddd, MMM D')

/**
 * The active Region's date order and clock, for native code that formats dates
 * itself the way `formatWeekdayMonthDayCompact` and `formatTime` do (e.g. the
 * iOS Notification Service Extension).
 */
export const activeDateConventions = (): {
  dayFirst: boolean
  clock24: boolean
} => ({
  dayFirst: activeDayFirst(),
  clock24: !/h/.test(moment.localeData().longDateFormat('LT')),
})

/** `es-es` → `es_ES`, `zh-tw` → `zh_Hant_TW`: Apple's form of a locale tag. */
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

/**
 * The Apple locale identifier for native pickers that format dates themselves
 * (SwiftUI's `DatePicker`), or `undefined` to keep the device's own locale.
 * `@expo/ui` drops any identifier iOS doesn't list as a whole locale, so this
 * can't mix a Language with another language's Region, nor carry the Time
 * Format. It picks the Format Region when it's in the Language (`en_AU`), else
 * the Language's own locale (`de_DE`). At Auto, a Language that matches the
 * device's keeps the device locale, with its region and 24-Hour Time setting.
 */
export const appleLocaleIdentifier = (config: {
  /** The app's Language, e.g. `es-es` or `zh-hant-tw`. */
  language: string
  /** Format Region moment locale key. `undefined` = Auto (device). */
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

/* ────────────────────────────────────────────────────────────────────────
 * Read-time display intents (ADR-0006)
 *
 * Every user-facing date/time must render through one of these so the Format
 * Region + Clock Format + Language patch reaches it. Hardcoded patterns like
 * `MMM D, YYYY` (defeats Date Order) or `h:mm A` (defeats Clock Format) bypass
 * the patch and are bugs. ISO storage keys (`YYYY-MM-DD`) are NOT display and
 * stay hardcoded — do not route them through here.
 *
 * Digits: `moment.format` always writes ASCII digits, in every Language
 * (`src/lib/momentLocales.ts` drops moment's digit-rewriting `postformat`), so
 * keys, ids and payloads built with it can't be corrupted. These helpers add
 * the app Language's digits (Arabic-Indic in Arabic) on top. A display string
 * built with a bare `.format()` shows Latin digits in Arabic: route it through
 * `formatDisplay` (a pattern) or `localizeDisplayDate` (a built string).
 *
 * Pick the helper by INTENT, not by token:
 *   - a clock time            → `formatTime`     (honors Clock Format)
 *   - a calendar date         → `formatDate`     (honors Format Region)
 *   - a date + time           → `formatDateTime` (honors both)
 *   - "3 days ago"            → `formatRelative`
 *   - "Today at 9:00 AM"      → `formatCalendar`
 *   - a tight year-less date  → `formatMonthDayCompact` / `formatWeekdayMonthDayCompact`
 *   - a month title, other    → `formatDisplay(m, 'MMMM YYYY')`
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Localizes the digits of a date or time already built with `moment.format` for
 * the app Language (`١٤ تشرين الأول (أكتوبر) ٢٠٢٦` in Arabic). A no-op in
 * Latin-digit Languages. Display only: never on keys, ids or payloads.
 */
export const localizeDisplayDate = (text: string): string =>
  localizeAppDateText(text)

/**
 * A display date in an explicit moment `pattern` (`MMMM YYYY`, `dddd, LL`), in
 * the app Language's digits. Prefer an intent helper below when one fits; use
 * this for month titles and other patterns they don't cover. Never for keys:
 * those use `moment.format` directly and stay ASCII.
 */
export const formatDisplay = (
  input: moment.MomentInput,
  pattern: string
): string => localizeDisplayDate(moment(input).format(pattern))

/**
 * `long` → written-out month (`LL`/`LLL`): "June 11, 2026". `medium` →
 * abbreviated month (`ll`/`lll`): "Jun 11, 2026".
 */
export type DateStyle = 'long' | 'medium'

/**
 * Point-in-time: a clock time honoring the user's Clock Format (12/24-hour) via
 * the `LT`/`LTS` tokens — "9:00 AM" (en) vs "09:00" (de). Pass `withSeconds`
 * for `LTS` ("9:00:00 AM").
 */
export const formatTime = (
  input: moment.MomentInput,
  options?: { withSeconds?: boolean }
): string => formatDisplay(input, options?.withSeconds ? 'LTS' : 'LT')

/**
 * Full calendar date honoring the user's Format Region (date order) and
 * Language (month names) via `LL`/`ll` — "June 11, 2026" vs "11 June 2026".
 */
export const formatDate = (
  input: moment.MomentInput,
  options?: { style?: DateStyle }
): string => formatDisplay(input, options?.style === 'medium' ? 'll' : 'LL')

/**
 * Date + time honoring both Format Region and Clock Format. Uses `LLL`/`lll`;
 * with `withSeconds` it composes the locale date with `LTS`, since no locale
 * token embeds seconds inside a datetime.
 */
export const formatDateTime = (
  input: moment.MomentInput,
  options?: { style?: DateStyle; withSeconds?: boolean }
): string => {
  const medium = options?.style === 'medium'
  if (options?.withSeconds)
    return formatDisplay(input, medium ? 'll LTS' : 'LL LTS')
  return formatDisplay(input, medium ? 'lll' : 'LLL')
}

/**
 * Relative time ("3 days ago", "in 2 hours") wrapping moment's `fromNow`.
 * `withoutSuffix` drops the "ago"/"in" wrapper ("3 days").
 */
export const formatRelative = (
  input: moment.MomentInput,
  options?: { withoutSuffix?: boolean }
): string => localizeDisplayDate(moment(input).fromNow(options?.withoutSuffix))

/**
 * Calendar-relative time ("Today at 9:00 AM", "Yesterday", "06/11/2026")
 * wrapping moment's `calendar`. `referenceTime` defaults to now; `formats`
 * overrides the per-bucket patterns (use locale tokens like `LT`).
 */
export const formatCalendar = (
  input: moment.MomentInput,
  options?: {
    referenceTime?: moment.MomentInput
    formats?: moment.CalendarSpec
  }
): string =>
  localizeDisplayDate(
    moment(input).calendar(options?.referenceTime, options?.formats)
  )

/**
 * A plan's start time rendered via the active locale's `LT` token ("9:00 AM"
 * en-US, "09:00" de-DE). Pass an explicit minutes-since-midnight value or
 * `undefined` to fall through to the default (noon).
 */
export const formatStartTime = (startTimeInMinutes?: number): string => {
  const minutes = startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES
  // A reading on the clock, not a moment: UTC never changes its clocks, so
  // 10:00 reads 10:00 even on a day the device's clocks change.
  return formatTime(moment.utc(0).add(minutes, 'minutes'))
}
