/**
 * Digits, numerals and bidi marks for the app's Languages.
 *
 * Arabic writes Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) with the Arabic decimal and
 * thousands separators (٫ ٬), as jw.org/ar and wol.jw.org/ar do. Every other
 * Language we ship writes Latin digits. The mapping is done here rather than
 * through `Intl`'s `numberingSystem`, so Hermes on iOS and Android print the
 * same thing.
 *
 * Pure: no React Native or store imports, so parsers, formatters and tests can
 * all use it. `src/lib/numbers.ts` adds the app Language on top.
 */

/** Digit systems the app writes, by CLDR numbering-system id. */
export type DigitSystem = 'latn' | 'arab'

const NATIVE_DIGITS: Record<Exclude<DigitSystem, 'latn'>, string> = {
  arab: '٠١٢٣٤٥٦٧٨٩',
}

const NATIVE_SEPARATORS: Record<
  Exclude<DigitSystem, 'latn'>,
  { decimal: string; group: string; list: string }
> = {
  arab: { decimal: '\u066B', group: '\u066C', list: '\u060C' }, // ٫ ٬ ،
}

// Languages that write non-Latin digits, by language subtag.
const DIGIT_SYSTEM_BY_LANGUAGE: Record<string, DigitSystem> = {
  ar: 'arab',
}

/** The digits `locale` (`ar`, `ar-EG`, `en-us`) writes numbers in. */
export function digitSystemFor(locale: string | undefined): DigitSystem {
  if (!locale) return 'latn'
  const language = locale.toLowerCase().split(/[-_]/)[0]
  return DIGIT_SYSTEM_BY_LANGUAGE[language] ?? 'latn'
}

/**
 * Rewrites the Latin digits 0-9 in `text` into `locale`'s digits. Leaves
 * everything else, including separators, alone. A no-op for Latin-digit
 * Languages.
 */
export function localizeDigits(text: string, locale: string | undefined) {
  const system = digitSystemFor(locale)
  if (system === 'latn') return text
  const digits = NATIVE_DIGITS[system]
  return text.replace(/[0-9]/g, (d) => digits[d.charCodeAt(0) - 48])
}

/**
 * Localizes a number already formatted the en-US way (`1,234.5`): the `.`
 * decimal point and `,` thousands separators between digits become `locale`'s
 * separators, then the digits are localized. Other punctuation stays.
 */
export function localizeNumeral(text: string, locale: string | undefined) {
  const system = digitSystemFor(locale)
  if (system === 'latn') return text
  const { decimal, group } = NATIVE_SEPARATORS[system]
  const separated = text.replace(
    /(\d)([.,])(?=\d)/g,
    (_, digit: string, separator: string) =>
      digit + (separator === '.' ? decimal : group)
  )
  return localizeDigits(separated, locale)
}

/**
 * Localizes a date or time moment wrote with Latin digits (`14 October 2026`,
 * `Wednesday, 13:30`) for `locale`: its digits, and in Arabic the Arabic comma
 * `،` for `,`, the way moment's own Arabic `postformat` did. Display only:
 * `src/lib/momentLocales.ts` keeps `moment.format` itself ASCII.
 */
export function localizeDateText(text: string, locale: string | undefined) {
  const system = digitSystemFor(locale)
  if (system === 'latn') return text
  return localizeDigits(text, locale).replace(
    /,/g,
    NATIVE_SEPARATORS[system].list
  )
}

/** Arabic-Indic ٠-٩ (U+0660…) and Persian/Urdu ۰-۹ (U+06F0…) to ASCII 0-9. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0)
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660))
  })
}

// Bidi controls a pasted or typed number may carry: LRM, RLM, ALM, isolates.
const BIDI_CONTROLS = /[\u200E\u200F\u061C\u2066-\u2069]/g

/**
 * Typed numeric input in ASCII form: any digit system to 0-9, the Arabic
 * decimal separator `٫` to `.`, the Arabic thousands separator `٬` and bidi
 * marks dropped, and the Arabic comma `،` to `,`. Run every parser's input
 * through this (or use {@link parseDecimalInput}/{@link parseIntegerInput}).
 */
export function normalizeNumericInput(text: string): string {
  return toAsciiDigits(text)
    .replace(BIDI_CONTROLS, '')
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, '')
    .replace(/\u060C/g, ',')
}

/**
 * Parses a typed decimal in any digit system, with `.`, `,` or `٫` as the
 * decimal separator. Spaces are ignored. Returns `undefined` for blank or
 * invalid input, including negatives and thousands separators.
 */
export function parseDecimalInput(text: string): number | undefined {
  // Only the first `,` becomes the decimal point, so `2,5` from a comma-decimal
  // keyboard reads 2.5. Typed numbers have no thousands separators: `1,234`
  // reads 1.234, and a second separator (`1,234,5`, `1.5,0`) is invalid below.
  const normalized = normalizeNumericInput(text)
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!normalized || normalized === '.') return undefined
  if (!/^\d*\.?\d*$/.test(normalized)) return undefined
  const value = Number(normalized)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Parses a typed whole number in any digit system. Returns `undefined` for
 * blank input or anything but digits (spaces aside).
 */
export function parseIntegerInput(text: string): number | undefined {
  const normalized = normalizeNumericInput(text).trim().replace(/\s/g, '')
  if (!/^\d+$/.test(normalized)) return undefined
  const value = Number(normalized)
  return Number.isSafeInteger(value) ? value : undefined
}

/**
 * Whether `text` contains only digits (any digit system), for inputs that
 * reject other keystrokes as they're typed. Blank passes.
 */
export function isDigitsOnlyInput(text: string): boolean {
  return /^\d*$/.test(normalizeNumericInput(text))
}

/** RIGHT-TO-LEFT MARK: a strong RTL character with no width. */
export const RLM = '\u200F'
