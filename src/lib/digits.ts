export type DigitSystem = 'latn' | 'arab'

const NATIVE_DIGITS: Record<Exclude<DigitSystem, 'latn'>, string> = {
  arab: '٠١٢٣٤٥٦٧٨٩',
}

const NATIVE_SEPARATORS: Record<
  Exclude<DigitSystem, 'latn'>,
  { decimal: string; group: string; list: string }
> = {
  arab: { decimal: '\u066B', group: '\u066C', list: '\u060C' },
}

const DIGIT_SYSTEM_BY_LANGUAGE: Record<string, DigitSystem> = {
  ar: 'arab',
}

export function digitSystemFor(locale: string | undefined): DigitSystem {
  if (!locale) return 'latn'
  const language = locale.toLowerCase().split(/[-_]/)[0]
  return DIGIT_SYSTEM_BY_LANGUAGE[language] ?? 'latn'
}

export function localizeDigits(text: string, locale: string | undefined) {
  const system = digitSystemFor(locale)
  if (system === 'latn') return text
  const digits = NATIVE_DIGITS[system]
  return text.replace(/[0-9]/g, (d) => digits[d.charCodeAt(0) - 48])
}

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

export function localizeDateText(text: string, locale: string | undefined) {
  const system = digitSystemFor(locale)
  if (system === 'latn') return text
  return localizeDigits(text, locale).replace(
    /,/g,
    NATIVE_SEPARATORS[system].list
  )
}

export function toAsciiDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0)
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660))
  })
}

const BIDI_CONTROLS = /[\u200E\u200F\u061C\u2066-\u2069]/g

export function normalizeNumericInput(text: string): string {
  return toAsciiDigits(text)
    .replace(BIDI_CONTROLS, '')
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, '')
    .replace(/\u060C/g, ',')
}

export function parseDecimalInput(text: string): number | undefined {
  const normalized = normalizeNumericInput(text)
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!normalized || normalized === '.') return undefined
  if (!/^\d*\.?\d*$/.test(normalized)) return undefined
  const value = Number(normalized)
  return Number.isFinite(value) ? value : undefined
}

export function parseIntegerInput(text: string): number | undefined {
  const normalized = normalizeNumericInput(text).trim().replace(/\s/g, '')
  if (!/^\d+$/.test(normalized)) return undefined
  const value = Number(normalized)
  return Number.isSafeInteger(value) ? value : undefined
}

export function isDigitsOnlyInput(text: string): boolean {
  return /^\d*$/.test(normalizeNumericInput(text))
}

export const RLM = '\u200F'
