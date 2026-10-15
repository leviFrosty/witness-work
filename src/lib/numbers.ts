import {
  digitSystemFor,
  localizeDateText,
  localizeDigits,
  localizeNumeral,
  toAsciiDigits,
  type DigitSystem,
} from '@/lib/digits'

/**
 * Number display in the app's Language. Pair with `src/lib/minutes.ts` for
 * durations and `src/lib/dates.ts` for dates.
 *
 * - **Digits** follow the app Language, never the device: Arabic shows
 *   Arabic-Indic digits with `٫`/`٬` separators, everything else Latin digits.
 * - **Separators** for Latin digits follow the Format Region (ADR 0006): an
 *   explicit Region's own conventions, else the device's region paired with the
 *   app Language (`en-DE` → `1.234,5`), else the app Language's.
 *
 * Store prices (RevenueCat's `priceString`) arrive formatted and stay as given.
 *
 * `applyFormatRegion` (`src/lib/dates.ts`) sets the conventions whenever the
 * Language or Region changes, so this module stays free of stores and native
 * modules and works in every runtime, tests included.
 */

type NumberConventions = {
  /** The app Language, e.g. `ar`, `ru-ru`, `zh-tw`. */
  language: string
  /** The digits the app Language writes. */
  digitSystem: DigitSystem
  /** BCP 47 locale whose separators Latin-digit numbers use. */
  locale: string
}

let conventions: NumberConventions = {
  language: 'en-us',
  digitSystem: 'latn',
  locale: 'en',
}

/**
 * The BCP 47 locale whose separators Latin-digit numbers use: an explicit
 * Format Region as is (`de-ch`), else the Language with the device's region
 * (`en-DE`), else the Language alone (`en`).
 */
export function numberFormatLocale(config: {
  language: string
  region?: string
  deviceRegion?: string | null
}): string {
  if (config.region) return config.region
  const language = config.language.toLowerCase().split(/[-_]/)[0]
  return config.deviceRegion
    ? `${language}-${config.deviceRegion.toUpperCase()}`
    : language
}

/** Called by `applyFormatRegion` with the active Language and Region. */
export function setNumberConventions(config: {
  language: string
  region?: string
  deviceRegion?: string | null
}): void {
  conventions = {
    language: config.language,
    digitSystem: digitSystemFor(config.language),
    locale: numberFormatLocale(config),
  }
}

/** The app Language numbers are written for, e.g. `ar`, `ru-ru`. */
export const appLanguage = (): string => conventions.language

/** The digit system the app Language writes. */
export const appDigitSystem = (): DigitSystem => conventions.digitSystem

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * A cached `Intl.NumberFormat` that always writes Latin digits. A Region's
 * locale can default to other digits on some platforms' ICU (`ar`, `ar-EG`,
 * `fa`), and digits follow the app Language, not the Region, so the Latin
 * numbering system is asked for explicitly.
 */
const numberFormatter = (
  locale: string,
  options: Intl.NumberFormatOptions | undefined
): Intl.NumberFormat => {
  const key = `${locale}|${JSON.stringify(options ?? {})}`
  let formatter = formatters.get(key)
  if (!formatter) {
    const latin = { ...options, numberingSystem: 'latn' }
    // An unsupported tag throws: drop the extension, then fall back to en-US.
    for (const tag of [`${locale}-u-nu-latn`, locale]) {
      try {
        formatter = new Intl.NumberFormat(tag, latin)
        break
      } catch {
        // Try the next tag.
      }
    }
    formatter ??= new Intl.NumberFormat('en-US', latin)
    formatters.set(key, formatter)
  }
  return formatter
}

/**
 * Latin digits and the `.`/`,` separators, in case a platform's Intl ignored
 * the numbering system it was asked for.
 */
const latinNumeral = (text: string): string =>
  toAsciiDigits(text)
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',')

/**
 * Formats `value` for display in the app Language, with grouping (`1,234.5`, `1
 * 234,5`, `١٬٢٣٤٫٥`). Takes `Intl.NumberFormat` options, e.g. `{
 * maximumFractionDigits: 1 }` or `{ style: 'currency', currency: 'EUR' }`. Use
 * {@link formatPlainNumber} where grouping would be wrong (years).
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  const { language, digitSystem, locale } = conventions
  if (digitSystem !== 'latn') {
    // Format the en-US way in Latin digits, then swap digits and separators
    // ourselves rather than trust each platform's Intl `numberingSystem`.
    return localizeNumeral(
      latinNumeral(numberFormatter('en-US', options).format(value)),
      language
    )
  }
  return latinNumeral(numberFormatter(locale, options).format(value))
}

/**
 * A number's digits in the app Language, without grouping: `2026` → `٢٠٢٦`,
 * `1.5` → `١٫٥` in Arabic, unchanged elsewhere. For years, and for values shown
 * the way they were typed.
 */
export function formatPlainNumber(value: number): string {
  return localizeNumeral(String(value), conventions.language)
}

/**
 * Localizes the digits of an already built string (`"12:30"`) for the app
 * Language. Separators stay as they are.
 */
export function localizeAppDigits(text: string): string {
  return localizeDigits(text, conventions.language)
}

/**
 * Localizes a date or time moment wrote (`14 October 2026`) for the app
 * Language: digits, and the Arabic comma in Arabic. Display only; use the
 * helpers in `src/lib/dates.ts` rather than calling this directly.
 */
export function localizeAppDateText(text: string): string {
  return localizeDateText(text, conventions.language)
}
